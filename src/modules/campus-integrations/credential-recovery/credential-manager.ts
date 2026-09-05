/**
 * [INPUT]: 依赖 db/schema、HttpClient/共享传输错误分类、CAS/TicketExchanger 的凭证与上游故障证据、CryptoHelper、user 级 PerKeySingleflight、真实学校登录事务原语、epoch 绑定的五秒 RecoveryCooldown、config、截止时间与 Logger
 * [OUTPUT]: 对外提供 CredentialManager 与 CredentialSystem，管理正 TTL 基础凭证、五秒分能力冷却与真实登录代次隔离、能力感知静默恢复、TGC 普通快照冲突有界补足、Portal-only 窄恢复与交互登录状态
 * [POS]: campus-integrations/credential-recovery 的基础凭证状态机；共享航班以实际能力自证，能力不足的 joiner 先复用新 TGC 串行补足且 mobile 调用不触碰 JW
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { eq, and, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { HttpClient } from '../http/http-client';
import { AuthEngine } from '../cas/auth-engine';
import { TicketExchanger } from '../cas/ticket-exchanger';
import { CryptoHelper } from '../../../utils/crypto';
import { config } from '../../../config';
import { Logger } from '../../../utils/logger';
import { PerKeySingleflight } from '../../cache/application/singleflight';
import { isTransientTransportError } from '../http/transport-errors';
import { RecoveryCooldown, type RecoveryScope } from './recovery-cooldown';
import {
  commitRealSchoolLoginContext,
  readSchoolLoginEpoch,
} from './school-login-context';

export type CredentialSystem = RecoveryScope;
type RecoveryRequirement = CredentialSystem | 'portal_only';

interface ResolvedCredential {
  value: string | null;
  cookieJar: string | null;
}

interface RecoveryOutcome {
  requirement: RecoveryRequirement;
  casAuthenticated: boolean;
  capabilities: readonly CredentialSystem[];
}

const INTERACTIVE_LOGIN_REQUIRED_SYSTEM = 'interactive_login_required';
const MANAGED_CREDENTIAL_SYSTEMS = [
  'cas_tgc',
  'portal_jwt',
  'jw_session',
  INTERACTIVE_LOGIN_REQUIRED_SYSTEM,
] as const;

const recoveryCooldown = new RecoveryCooldown((userId) => readSchoolLoginEpoch(getDb(), userId));
const TGC_CONFLICT_RETRIES = 1;

// 同一用户并发触发静默重认证时共享在途 CAS 登录链，防止恢复风暴打爆上游并互相覆盖凭证。
const reAuthFlights = new PerKeySingleflight();
const credentialFlights = new PerKeySingleflight();
const tgcFlights = new PerKeySingleflight();

function isTransientRecoveryError(error: unknown): boolean {
  const message = String((error as any)?.message || '');
  return isTransientTransportError(error) || /_HTTP_5\d\d$/i.test(message);
}

function requiredCapability(requirement: RecoveryRequirement): CredentialSystem {
  return requirement === 'portal_only' ? 'portal_jwt' : requirement;
}

function satisfiesRequirement(outcome: RecoveryOutcome, requirement: RecoveryRequirement): boolean {
  return outcome.capabilities.includes(requiredCapability(requirement));
}

function recoveryOutcome(
  requirement: RecoveryRequirement,
  casAuthenticated: boolean,
  capabilities: CredentialSystem[],
): RecoveryOutcome {
  return { requirement, casAuthenticated, capabilities: [...new Set(capabilities)] };
}

export class CredentialManager {
  static async requiresInteractiveLogin(userId: number): Promise<boolean> {
    const db = getDb();
    const rows = await db.select({ id: schema.credentials.id })
      .from(schema.credentials)
      .where(and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.system, INTERACTIVE_LOGIN_REQUIRED_SYSTEM)
      ))
      .limit(1);
    return rows.length > 0;
  }

  static async markInteractiveLoginRequired(userId: number): Promise<void> {
    const db = getDb();
    const now = new Date();
    await db.insert(schema.credentials).values({
      userId,
      system: INTERACTIVE_LOGIN_REQUIRED_SYSTEM,
      value: 'captcha_required',
      cookieJar: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [schema.credentials.userId, schema.credentials.system],
      set: { value: 'captcha_required', updatedAt: now },
    });
  }

  static async clearLoginRecoveryState(userId: number): Promise<void> {
    const db = getDb();
    await db.delete(schema.credentials)
      .where(and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.system, INTERACTIVE_LOGIN_REQUIRED_SYSTEM)
      ));
    recoveryCooldown.clear(userId);
  }

  /**
   * Store a credential in the database (atomic upsert)
   */
  static async storeCredential(
    userId: number,
    system: CredentialSystem,
    value: string | null,
    cookieJar: string | null,
    ttlMs: number
  ): Promise<void> {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new Error('CREDENTIAL_TTL_MUST_BE_POSITIVE_INTEGER');
    }
    const db = getDb();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    await db.insert(schema.credentials).values({
      userId, system, value, cookieJar, expiresAt,
      createdAt: now, updatedAt: now,
    }).onConflictDoUpdate({
      target: [schema.credentials.userId, schema.credentials.system],
      set: { value, cookieJar, expiresAt, updatedAt: now },
    });
  }

  /**
   * Get a valid (non-expired) credential
   */
  static async getCredential(userId: number, system: CredentialSystem): Promise<ResolvedCredential | null> {
    const db = getDb();
    const rows = await db.select()
      .from(schema.credentials)
      .where(and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.system, system)
      ))
      .limit(1);

    if (rows.length === 0) return null;
    const cred = rows[0];
    if (!cred.expiresAt || cred.expiresAt.getTime() <= Date.now()) return null;
    return { value: cred.value, cookieJar: cred.cookieJar };
  }

  /**
   * Get credential with full refresh chain:
   *   1. Return if valid
   *   2. Expired → try refresh via TGC
   *   3. TGC also expired → silent re-auth with stored password
   */
  static async getOrRefreshCredential(
    userId: number,
    system: CredentialSystem,
    deadlineAt?: number,
  ): Promise<ResolvedCredential | null> {
    return this.resolveWithCooldown(userId, system, () => this.resolveCredential(userId, system, deadlineAt));
  }

  private static async resolveCredential(
    userId: number, system: CredentialSystem, deadlineAt?: number,
  ): Promise<ResolvedCredential | null> {
    const existing = await this.getCredential(userId, system);
    if (existing) return existing;

    if (await this.requiresInteractiveLogin(userId)) {
      Logger.warn('CredentialManager', '等待验证码登录，跳过静默恢复', `system=${system}`, String(userId));
      return null;
    }

    if (system === 'cas_tgc') {
      // TGC expired — only way to get a new one is full CAS login
      await this.silentReAuth(userId, deadlineAt, 'cas_tgc');
      return this.getCredential(userId, 'cas_tgc');
    }

    // Try refresh from TGC first
    const tgc = await this.getCredential(userId, 'cas_tgc');
    if (tgc?.cookieJar) {
      const refreshed = await this.refreshFromTGC(userId, system, tgc.cookieJar, deadlineAt);
      if (refreshed) return refreshed;
    }

    // TGC missing or refresh failed — silent re-auth
    Logger.warn('CredentialManager', `${system} 刷新失败, 尝试静默重认证`, undefined, String(userId));
    await this.silentReAuth(userId, deadlineAt, system);
    return this.getCredential(userId, system);
  }

  /** 派生业务共享窄端口：同用户连同 TGC 换票一起合并，恢复 Portal 不激活 JW。 */
  static async getOrRefreshPortalCredentialWithoutJw(
    userId: number,
    deadlineAt?: number,
  ): Promise<ResolvedCredential | null> {
    return this.resolveWithCooldown(userId, 'portal_only', async () => {
      const existing = await this.getCredential(userId, 'portal_jwt');
      if (existing) return existing;
      if (await this.requiresInteractiveLogin(userId)) return null;

      const tgc = await this.getCredential(userId, 'cas_tgc');
      if (tgc?.cookieJar) {
        const refreshed = await this.refreshFromTGC(userId, 'portal_jwt', tgc.cookieJar, deadlineAt);
        if (refreshed) return refreshed;
      }
      await this.recoverRequirement(userId, deadlineAt, 'portal_only');
      return this.getCredential(userId, 'portal_jwt');
    });
  }

  /** 失败窗口只约束缺失能力；已有凭证始终优先，普通登录不参与此路径。 */
  private static async resolveWithCooldown(
    userId: number,
    requirement: RecoveryRequirement,
    operation: () => Promise<ResolvedCredential | null>,
  ): Promise<ResolvedCredential | null> {
    const system = requiredCapability(requirement);
    // 显式登录可能已提交新凭证；新请求不应继续等待旧恢复航班。
    const available = await this.getCredential(userId, system);
    if (available) return available;
    return credentialFlights.run(`credential:${userId}:${requirement}`, 'normal', async () => {
      const current = await this.getCredential(userId, system);
      if (current) return current;
      if (await this.requiresInteractiveLogin(userId)) return null;
      if (this.isRecoveryCooling(userId, system)) return null;
      const epoch = readSchoolLoginEpoch(getDb(), userId);
      try {
        const result = await operation();
        if (!result && !recoveryCooldown.read(userId, 'cas_tgc')) recoveryCooldown.record(userId, system, epoch);
        return result;
      } catch (error) {
        if (readSchoolLoginEpoch(getDb(), userId) !== epoch) {
          const latest = await this.getCredential(userId, system);
          if (latest) return latest;
        }
        if (!recoveryCooldown.read(userId, 'cas_tgc')) recoveryCooldown.record(userId, system, epoch, error);
        throw error;
      }
    });
  }

  private static isRecoveryCooling(userId: number, scope: CredentialSystem): boolean {
    const state = recoveryCooldown.read(userId, scope);
    if (!state) return false;
    Logger.warn('CredentialManager', '凭证恢复冷却中',
      `system=${scope} retryAfterSeconds=${Math.ceil((state.retryAt - Date.now()) / 1000)}`, String(userId));
    if (state.error) throw state.error;
    return true;
  }

  /**
   * Refresh a sub-credential using a valid TGC
   */
  private static async refreshFromTGC(
    userId: number,
    system: CredentialSystem,
    tgcJar: string,
    deadlineAt?: number,
    conflictRetries = TGC_CONFLICT_RETRIES,
  ): Promise<ResolvedCredential | null> {
    return tgcFlights.run(`tgc:${userId}:${system}`, 'normal', () =>
      this.exchangeFromTGC(userId, system, tgcJar, deadlineAt, conflictRetries));
  }

  private static async exchangeFromTGC(
    userId: number, system: CredentialSystem, tgcJar: string,
    deadlineAt?: number, conflictRetries = TGC_CONFLICT_RETRIES,
  ): Promise<ResolvedCredential | null> {
    const snapshot = getDb().transaction((tx) => ({
      epoch: readSchoolLoginEpoch(tx, userId),
      tgcJar: tx.select({ cookieJar: schema.credentials.cookieJar }).from(schema.credentials).where(and(
        eq(schema.credentials.userId, userId), eq(schema.credentials.system, 'cas_tgc'),
      )).get()?.cookieJar,
    }));
    const loginEpoch = snapshot.epoch;
    const resolveConflict = () => this.resolveTgcConflict(userId, system, loginEpoch, conflictRetries, deadlineAt);
    if (snapshot.tgcJar !== tgcJar) return resolveConflict();
    const client = HttpClient.fromSerializedJar(tgcJar, deadlineAt);
    const start = Date.now();

    // TGC 换票可与真实 CAS 登录交错；旧 epoch 航班不得覆盖新登录的 TGC/Portal/JW。
    const commitRefreshed = (value: string | null, cookieJar: string | null, ttlMs: number): boolean => {
      return getDb().transaction((tx) => {
        if (readSchoolLoginEpoch(tx, userId) !== loginEpoch) return false;
        const currentTgc = tx.select({ cookieJar: schema.credentials.cookieJar }).from(schema.credentials).where(and(
          eq(schema.credentials.userId, userId), eq(schema.credentials.system, 'cas_tgc'),
        )).get();
        // 同 epoch 的显式清理/轮换也不能被迟到换票撤销。
        if (currentTgc?.cookieJar !== tgcJar) return false;
        const now = new Date();
        for (const credential of [
          { system: 'cas_tgc', value: null, cookieJar: client.serializeJar(), ttlMs: config.ttl.tgc },
          { system, value, cookieJar, ttlMs },
        ]) {
          const fields = { value: credential.value, cookieJar: credential.cookieJar, expiresAt: new Date(now.getTime() + credential.ttlMs), updatedAt: now };
          tx.insert(schema.credentials).values({ userId, system: credential.system, createdAt: now, ...fields })
            .onConflictDoUpdate({ target: [schema.credentials.userId, schema.credentials.system], set: fields }).run();
        }
        return true;
      });
    };

    if (system === 'portal_jwt') {
      const result = await TicketExchanger.exchangePortalToken(client);
      if (result.upstreamError) throw result.upstreamError;
      if (result.token) {
        if (!commitRefreshed(result.token, null, config.ttl.portalJwt)) return resolveConflict();
        Logger.auth(String(userId), '静默刷新 Portal', 200, Date.now() - start, undefined, [
          { label: 'TGC → Portal JWT', ok: true },
        ]);
        return { value: result.token, cookieJar: null };
      }
      Logger.auth(String(userId), '静默刷新 Portal 失败', 0, Date.now() - start, undefined, [
        { label: 'TGC → Portal JWT', ok: false },
      ]);
      return null;
    }

    if (system === 'jw_session') {
      const result = await TicketExchanger.exchangeJwSession(client);
      if (result.success) {
        if (!commitRefreshed(null, client.serializeJar(), config.ttl.jwSession)) return resolveConflict();
        Logger.auth(String(userId), '静默刷新 JW', 200, Date.now() - start, undefined, [
          { label: 'TGC → JW Session', ok: true },
        ]);
        return { value: null, cookieJar: client.serializeJar() };
      }
      Logger.auth(String(userId), '静默刷新 JW 失败', 0, Date.now() - start, undefined, [
        { label: 'TGC → JW Session', ok: false },
      ]);
      if (result.upstreamUnavailable) {
        throw new Error('REQUEST_TIMEOUT');
      }
      return null;
    }

    return null;
  }

  /** 普通换票竞争先复用最新能力，再以同 epoch 有效 TGC 补一次；竞争耗尽不升级为密码登录。 */
  private static async resolveTgcConflict(
    userId: number,
    system: CredentialSystem,
    loginEpoch: number,
    retries: number,
    deadlineAt?: number,
  ): Promise<ResolvedCredential | null> {
    const current = await this.getCredential(userId, system);
    if (current) return current;
    const snapshot = getDb().transaction((tx) => ({
      epoch: readSchoolLoginEpoch(tx, userId),
      tgc: tx.select().from(schema.credentials).where(and(
        eq(schema.credentials.userId, userId), eq(schema.credentials.system, 'cas_tgc'),
      )).get(),
    }));
    // 真实登录切换、显式清理和过期都不是普通快照竞争，不能用旧航班继续换票。
    if (snapshot.epoch !== loginEpoch || !snapshot.tgc?.cookieJar
      || !snapshot.tgc.expiresAt || snapshot.tgc.expiresAt.getTime() <= Date.now()) return null;
    if (retries <= 0 || (deadlineAt !== undefined && Date.now() >= deadlineAt)) throw new Error('REQUEST_TIMEOUT');
    return this.exchangeFromTGC(userId, system, snapshot.tgc.cookieJar, deadlineAt, retries - 1);
  }

  /**
   * Silent re-authentication: re-run full CAS flow using stored password.
   * User is completely unaware this is happening.
   * 失败后固定冷却五秒；CAS 拒绝与各子系统激活失败分别节流，不累计历史失败。
   * 同一用户并发调用共享在途恢复（首个调用方的 deadline 主导本次恢复）。
   */
  static async silentReAuth(
    userId: number,
    deadlineAt?: number,
    requiredSystem?: CredentialSystem,
  ): Promise<boolean> {
    const requirement = requiredSystem || 'jw_session';
    const outcome = await this.recoverRequirement(userId, deadlineAt, requirement);
    return satisfiesRequirement(outcome, requirement);
  }

  private static async recoverRequirement(
    userId: number,
    deadlineAt: number | undefined,
    requirement: RecoveryRequirement,
  ): Promise<RecoveryOutcome> {
    if (await this.requiresInteractiveLogin(userId)) return recoveryOutcome(requirement, false, []);
    if (this.isRecoveryCooling(userId, requiredCapability(requirement))) {
      return recoveryOutcome(requirement, false, []);
    }
    let operation = () => this.executeSilentReAuth(userId, deadlineAt, requirement);

    // 同 key 保证任何时刻只有一条恢复链；joiner 只能在共享结果自证能力不足后排队补足。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const outcome = await reAuthFlights.run(`silent-reauth:${userId}`, 'normal', operation);
      if (satisfiesRequirement(outcome, requirement) || outcome.requirement === requirement) {
        return outcome;
      }
      operation = () => this.supplementRecovery(userId, deadlineAt, requirement);
    }
    return recoveryOutcome(requirement, false, []);
  }

  private static async supplementRecovery(
    userId: number,
    deadlineAt: number | undefined,
    requirement: RecoveryRequirement,
  ): Promise<RecoveryOutcome> {
    const system = requiredCapability(requirement);
    const current = await this.getCredential(userId, system);
    if (current) return recoveryOutcome(requirement, false, [system]);
    if (this.isRecoveryCooling(userId, system)) return recoveryOutcome(requirement, false, []);

    const tgc = await this.getCredential(userId, 'cas_tgc');
    if (system === 'cas_tgc' && tgc) {
      return recoveryOutcome(requirement, false, ['cas_tgc']);
    }
    if (tgc?.cookieJar && system !== 'cas_tgc') {
      const refreshed = await this.refreshFromTGC(userId, system, tgc.cookieJar, deadlineAt);
      if (refreshed) return recoveryOutcome(requirement, false, ['cas_tgc', system]);
    }

    // 新 TGC 也无法补足时，仍经同一 user key 串行进入既有 CAS 恢复语义。
    return this.executeSilentReAuth(userId, deadlineAt, requirement);
  }

  private static async executeSilentReAuth(
    userId: number,
    deadlineAt?: number,
    requiredSystem?: RecoveryRequirement,
  ): Promise<RecoveryOutcome> {
    const requirement = requiredSystem || 'jw_session';
    if (await this.requiresInteractiveLogin(userId)) {
      Logger.warn('SilentReAuth', '等待验证码登录，跳过静默重认证', undefined, String(userId));
      return recoveryOutcome(requirement, false, []);
    }

    if (this.isRecoveryCooling(userId, 'cas_tgc')) return recoveryOutcome(requirement, false, []);
    const loginEpoch = readSchoolLoginEpoch(getDb(), userId);

    const db = getDb();
    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (users.length === 0) {
      Logger.warn('CredentialManager', '用户不存在，无法静默重认证', `user_id=${userId}`, String(userId));
      return recoveryOutcome(requirement, false, []);
    }
    const user = users[0];

    if (!user.encryptedPassword) {
      Logger.warn('CredentialManager', '无存储密码，无法静默重认证', undefined, user.studentId);
      return recoveryOutcome(requirement, false, []);
    }

    const password = CryptoHelper.decryptAES(user.encryptedPassword, config.jwtSecret);
    if (!password) {
      Logger.warn('CredentialManager', '密码解密失败', undefined, user.studentId);
      return recoveryOutcome(requirement, false, []);
    }

    const start = Date.now();
    const steps: import('../../../utils/logger').LoginStep[] = [];

    const client = new HttpClient(undefined, config.timeout.cas);
    client.setDeadline(deadlineAt);
    const engine = new AuthEngine(client);
    let casAuthenticated = false;
    let portalToken: string | null = null;
    let jwCookieJar: string | null = null;
    let commitAttempted = false;
    let committedEpoch: number | null = null;
    let failureScope: CredentialSystem = 'cas_tgc';
    const latestOutcome = async () => {
      const capabilities: CredentialSystem[] = [];
      // Portal-only 恢复不得读取 JW，即使正在复用另一条真实登录提交的上下文。
      for (const system of requirement === 'portal_only'
        ? ['cas_tgc', 'portal_jwt'] as const : ['cas_tgc', 'portal_jwt', 'jw_session'] as const) {
        if (await this.getCredential(userId, system)) capabilities.push(system);
      }
      return recoveryOutcome(requirement, false, capabilities);
    };
    const staleLogin = () => readSchoolLoginEpoch(getDb(), userId) !== (committedEpoch ?? loginEpoch);
    const recordFailure = (scope: CredentialSystem, error: unknown = null) =>
      recoveryCooldown.record(userId, scope, committedEpoch ?? loginEpoch, error);

    const commitAuthenticatedContext = async () => {
      if (!casAuthenticated || commitAttempted) return;
      commitAttempted = true;
      committedEpoch = this.persistRealSchoolLogin(userId, client.serializeJar(), portalToken, jwCookieJar, loginEpoch);
    };

    const acquiredCapabilities = (): CredentialSystem[] => [
      'cas_tgc',
      ...(portalToken ? ['portal_jwt' as const] : []),
      ...(jwCookieJar ? ['jw_session' as const] : []),
    ];

    try {
      // 1. Get CAS cookies
      await engine.getCaptcha();
      steps.push({ label: 'CAS Cookie', ok: true });

      // 2. Get execution token
      const execution = await engine.getExecution();
      if (!execution) {
        steps.push({ label: 'Execution', ok: false, detail: '获取失败' });
        throw new Error('REQUEST_TIMEOUT');
      }
      steps.push({ label: 'Execution', ok: true });

      // 3. Login without captcha
      if (staleLogin()) return latestOutcome();
      const result = await engine.login(user.studentId, password, '', execution);
      if (staleLogin()) return latestOutcome();
      if (!result.success) {
        steps.push({ label: 'CAS Login', ok: false, detail: result.needCaptcha ? '需要验证码' : result.message });
        recordFailure('cas_tgc');
        if (result.needCaptcha) {
          this.markInteractiveLoginRequiredIfEpochMatches(userId, loginEpoch);
        }
        Logger.auth(user.studentId, '静默重认证失败', 0, Date.now() - start, user.name || undefined, steps);
        return recoveryOutcome(requirement, false, []);
      }
      steps.push({ label: 'CAS Login', ok: true });
      casAuthenticated = true;

      // 4. Portal token
      failureScope = 'portal_jwt';
      portalToken = result.portalToken || null;
      if (!portalToken) {
        const portalResult = await TicketExchanger.exchangePortalToken(client);
        steps.push(...portalResult.steps);
        if (portalResult.upstreamError) throw portalResult.upstreamError;
        if (portalResult.token) {
          portalToken = portalResult.token;
        }
      } else {
        steps.push({ label: 'Portal', ok: true });
      }

      // 5. Portal-only recovery stops here: Portal/mobile reads must never activate or replace JW.
      if (requiredSystem === 'portal_only') {
        await commitAuthenticatedContext();
        if (staleLogin()) return latestOutcome();
        if (!portalToken) {
          recordFailure('portal_jwt');
          Logger.auth(user.studentId, '静默重认证失败', 0, Date.now() - start, user.name || undefined, steps);
          return recoveryOutcome(requirement, true, acquiredCapabilities());
        }
        Logger.auth(user.studentId, '静默重认证成功', 200, Date.now() - start, user.name || undefined, steps);
        return recoveryOutcome(requirement, true, acquiredCapabilities());
      }

      // 6. Activate JW session
      failureScope = 'jw_session';
      const jwResult = await TicketExchanger.exchangeJwSession(client);
      if (!jwResult.success) {
        steps.push({ label: 'JW 激活', ok: false });
        await commitAuthenticatedContext();
        if (staleLogin()) return latestOutcome();
        if (!portalToken) recordFailure('portal_jwt');
        if (jwResult.upstreamUnavailable && requiredSystem === 'jw_session') {
          throw new Error('REQUEST_TIMEOUT');
        }
        recordFailure('jw_session', jwResult.upstreamUnavailable ? new Error('REQUEST_TIMEOUT') : null);
        Logger.auth(user.studentId, '静默重认证失败', 0, Date.now() - start, user.name || undefined, steps);
        return recoveryOutcome(requirement, true, acquiredCapabilities());
      }
      steps.push({ label: 'JW 激活', ok: true });

      // 7. 一次事务提交真实 CAS 登录的新上下文与本次可用基础凭证。
      jwCookieJar = client.serializeJar();
      await commitAuthenticatedContext();
      if (staleLogin()) return latestOutcome();
      if (!portalToken) recordFailure('portal_jwt');
      Logger.auth(user.studentId, '静默重认证成功', 200, Date.now() - start, user.name || undefined, steps);
      return recoveryOutcome(requirement, true, acquiredCapabilities());
    } catch (caught: any) {
      let e = caught?.message === 'CAS_MAINTENANCE'
        ? new Error('REQUEST_TIMEOUT', { cause: caught }) : caught;
      if (casAuthenticated && !commitAttempted) {
        try {
          await commitAuthenticatedContext();
        } catch (persistenceError) {
          e = persistenceError;
        }
      }
      if (staleLogin()) return latestOutcome();
      steps.push({ label: '异常', ok: false, detail: e.message });
      Logger.auth(user.studentId, '静默重认证异常', 0, Date.now() - start, user.name || undefined, steps);
      recordFailure(failureScope, isTransientRecoveryError(e) ? e : null);
      if (isTransientRecoveryError(e)) throw e;
      return recoveryOutcome(requirement, casAuthenticated, casAuthenticated ? acquiredCapabilities() : []);
    }
  }

  /** 验证码拒绝与新登录竞争时，只允许旧代次原子清理自身凭证并写入交互标记。 */
  private static markInteractiveLoginRequiredIfEpochMatches(userId: number, epoch: number): void {
    getDb().transaction((tx) => {
      if (readSchoolLoginEpoch(tx, userId) !== epoch) return;
      tx.delete(schema.credentials).where(and(
        eq(schema.credentials.userId, userId),
        inArray(schema.credentials.system, ['cas_tgc', 'portal_jwt', 'jw_session']),
      )).run();
      const now = new Date();
      tx.insert(schema.credentials).values({
        userId, system: INTERACTIVE_LOGIN_REQUIRED_SYSTEM, value: 'captcha_required',
        cookieJar: null, expiresAt: null, createdAt: now, updatedAt: now,
      }).onConflictDoUpdate({
        target: [schema.credentials.userId, schema.credentials.system],
        set: { value: 'captcha_required', updatedAt: now },
      }).run();
    });
  }

  private static persistRealSchoolLogin(
    userId: number, casCookieJar: string, portalToken: string | null,
    jwCookieJar: string | null, expectedEpoch: number,
  ): number | null {
    return getDb().transaction((tx) => {
      if (readSchoolLoginEpoch(tx, userId) !== expectedEpoch) return null;
      return commitRealSchoolLoginContext(tx, {
        userId, casCookieJar, portalToken, jwCookieJar, at: new Date(),
      });
    });
  }

  /**
   * 单次恢复链解析凭证与客户端：一次 getOrRefreshCredential 同时返回 value 与可发请求的 client，
   * 避免 portal 模式恢复链跑两遍、白白消耗请求级总预算。
   */
  static async resolveCredentialClient(
    userId: number,
    system: CredentialSystem,
    deadlineAt?: number,
  ): Promise<{ client: HttpClient; value: string | null } | null> {
    const cred = await this.getOrRefreshCredential(userId, system, deadlineAt);
    if (!cred) return null;

    if (cred.cookieJar) {
      return { client: HttpClient.fromSerializedJar(cred.cookieJar, deadlineAt), value: cred.value };
    }

    // For portal_jwt, we need the TGC's cookie jar
    if (system === 'portal_jwt') {
      const tgc = await this.getCredential(userId, 'cas_tgc');
      if (tgc?.cookieJar) {
        return { client: HttpClient.fromSerializedJar(tgc.cookieJar, deadlineAt), value: cred.value };
      }
    }

    const client = new HttpClient();
    client.setDeadline(deadlineAt);
    return { client, value: cred.value };
  }

  /**
   * Invalidate a credential
   */
  static async invalidate(userId: number, system: CredentialSystem): Promise<void> {
    const db = getDb();
    await db.delete(schema.credentials)
      .where(and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.system, system)
      ));
  }

  static async invalidateAll(userId: number): Promise<void> {
    const db = getDb();
    await db.delete(schema.credentials)
      .where(and(
        eq(schema.credentials.userId, userId),
        inArray(schema.credentials.system, [...MANAGED_CREDENTIAL_SYSTEMS]),
      ));
  }

  private static async invalidateSchoolCredentials(userId: number): Promise<void> {
    await Promise.all([
      this.invalidate(userId, 'cas_tgc'),
      this.invalidate(userId, 'portal_jwt'),
      this.invalidate(userId, 'jw_session'),
    ]);
  }

  static async cleanupExpired(): Promise<void> {
    const db = getDb();
    const now = Date.now();
    await db.run(sql`DELETE FROM credentials WHERE expires_at IS NOT NULL AND expires_at < ${now}`);
  }
}
