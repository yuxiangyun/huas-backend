/**
 * [INPUT]: 依赖 db/schema、HttpClient、AuthEngine、TicketExchanger、CryptoHelper、PerKeySingleflight、config、可选恢复截止时间与 Logger
 * [OUTPUT]: 对外提供 CredentialManager 与 CredentialSystem，管理三类强制正 TTL 学校凭证、受总预算约束的同用户单飞恢复、真实登录 Portal 替换语义与持久化交互登录状态
 * [POS]: campus-integrations/credential-recovery 的基础学校凭证收敛层；新 epoch 不继承缺失的旧 Portal JWT，派生业务会话由各模块自有仓储管理
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
import {
  advanceSchoolLoginEpoch,
  type SchoolLoginTransaction,
} from './school-login-context';

export type CredentialSystem = 'cas_tgc' | 'portal_jwt' | 'jw_session';
type RecoveryRequirement = CredentialSystem | 'portal_only';

interface ResolvedCredential {
  value: string | null;
  cookieJar: string | null;
}

const INTERACTIVE_LOGIN_REQUIRED_SYSTEM = 'interactive_login_required';
const MANAGED_CREDENTIAL_SYSTEMS = [
  'cas_tgc',
  'portal_jwt',
  'jw_session',
  INTERACTIVE_LOGIN_REQUIRED_SYSTEM,
] as const;

// Silent re-auth cooldown tracking
const reAuthState = new Map<number, { failCount: number; lastAttempt: number }>();
const REAUTH_MAX_ATTEMPTS = 3;
const REAUTH_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown after max failures

// 同一用户并发触发静默重认证时共享在途 CAS 登录链，防止恢复风暴打爆上游并互相覆盖凭证。
const reAuthFlights = new PerKeySingleflight();

function isTransientRecoveryError(error: unknown): boolean {
  const message = String((error as any)?.message || '');
  if (message === 'REQUEST_TIMEOUT') return true;
  return /ECONNRESET|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|fetch failed|network|_HTTP_(?:502|503|504)$/i.test(message);
}

function upsertCredentialInTransaction(
  tx: SchoolLoginTransaction,
  input: {
    userId: number;
    system: CredentialSystem;
    value: string | null;
    cookieJar: string | null;
    ttlMs: number;
    at: Date;
  },
): void {
  const expiresAt = new Date(input.at.getTime() + input.ttlMs);
  tx.insert(schema.credentials).values({
    userId: input.userId,
    system: input.system,
    value: input.value,
    cookieJar: input.cookieJar,
    expiresAt,
    createdAt: input.at,
    updatedAt: input.at,
  }).onConflictDoUpdate({
    target: [schema.credentials.userId, schema.credentials.system],
    set: {
      value: input.value,
      cookieJar: input.cookieJar,
      expiresAt,
      updatedAt: input.at,
    },
  }).run();
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
    reAuthState.delete(userId);
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

  /** mobile-yxt 窄端口专用：恢复 Portal 只触碰 CAS/Portal，绝不激活 JW。 */
  static async getOrRefreshPortalCredentialWithoutJw(
    userId: number,
    deadlineAt?: number,
  ): Promise<ResolvedCredential | null> {
    const existing = await this.getCredential(userId, 'portal_jwt');
    if (existing) return existing;
    if (await this.requiresInteractiveLogin(userId)) return null;

    const tgc = await this.getCredential(userId, 'cas_tgc');
    if (tgc?.cookieJar) {
      const refreshed = await this.refreshFromTGC(userId, 'portal_jwt', tgc.cookieJar, deadlineAt);
      if (refreshed) return refreshed;
    }
    await reAuthFlights.run(
      `silent-reauth:${userId}`,
      'normal',
      () => this.executeSilentReAuth(userId, deadlineAt, 'portal_only'),
    );
    return this.getCredential(userId, 'portal_jwt');
  }

  /**
   * Refresh a sub-credential using a valid TGC
   */
  private static async refreshFromTGC(
    userId: number,
    system: CredentialSystem,
    tgcJar: string,
    deadlineAt?: number
  ): Promise<ResolvedCredential | null> {
    const client = HttpClient.fromSerializedJar(tgcJar, deadlineAt);
    const start = Date.now();

    if (system === 'portal_jwt') {
      const result = await TicketExchanger.exchangePortalToken(client);
      if (result.token) {
        await this.storeCredential(userId, 'cas_tgc', null, client.serializeJar(), config.ttl.tgc);
        await this.storeCredential(userId, 'portal_jwt', result.token, null, config.ttl.portalJwt);
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
        await this.storeCredential(userId, 'cas_tgc', null, client.serializeJar(), config.ttl.tgc);
        await this.storeCredential(userId, 'jw_session', null, client.serializeJar(), config.ttl.jwSession);
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

  /**
   * Silent re-authentication: re-run full CAS flow using stored password.
   * User is completely unaware this is happening.
   * Max 3 attempts with 1-minute cooldown after exhaustion.
   * 同一用户并发调用共享在途恢复（首个调用方的 deadline 主导本次恢复）。
   */
  static async silentReAuth(
    userId: number,
    deadlineAt?: number,
    requiredSystem?: CredentialSystem,
  ): Promise<boolean> {
    return reAuthFlights.run(
      `silent-reauth:${userId}`,
      'normal',
      () => this.executeSilentReAuth(userId, deadlineAt, requiredSystem),
    );
  }

  private static async executeSilentReAuth(
    userId: number,
    deadlineAt?: number,
    requiredSystem?: RecoveryRequirement,
  ): Promise<boolean> {
    if (await this.requiresInteractiveLogin(userId)) {
      Logger.warn('SilentReAuth', '等待验证码登录，跳过静默重认证', undefined, String(userId));
      return false;
    }

    // Cooldown check
    const state = reAuthState.get(userId);
    if (state) {
      if (state.failCount >= REAUTH_MAX_ATTEMPTS) {
        if (Date.now() - state.lastAttempt < REAUTH_COOLDOWN_MS) {
          Logger.warn('SilentReAuth', `冷却中, 跳过重认证 (${state.failCount} 次失败)`, undefined, String(userId));
          return false;
        }
        reAuthState.delete(userId);
      }
    }

    const db = getDb();
    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (users.length === 0) {
      Logger.warn('CredentialManager', '用户不存在，无法静默重认证', `user_id=${userId}`, String(userId));
      return false;
    }
    const user = users[0];

    if (!user.encryptedPassword) {
      Logger.warn('CredentialManager', '无存储密码，无法静默重认证', undefined, user.studentId);
      return false;
    }

    const password = CryptoHelper.decryptAES(user.encryptedPassword, config.jwtSecret);
    if (!password) {
      Logger.warn('CredentialManager', '密码解密失败', undefined, user.studentId);
      return false;
    }

    const start = Date.now();
    const steps: import('../../../utils/logger').LoginStep[] = [];

    const client = new HttpClient(undefined, config.timeout.cas);
    client.setDeadline(deadlineAt);
    const engine = new AuthEngine(client);

    try {
      // 1. Get CAS cookies
      await engine.getCaptcha();
      steps.push({ label: 'CAS Cookie', ok: true });

      // 2. Get execution token
      const execution = await engine.getExecution();
      if (!execution) {
        steps.push({ label: 'Execution', ok: false, detail: '获取失败' });
        this.recordReAuthFailure(userId);
        Logger.auth(user.studentId, '静默重认证失败', 0, Date.now() - start, user.name || undefined, steps);
        return false;
      }
      steps.push({ label: 'Execution', ok: true });

      // 3. Login without captcha
      const result = await engine.login(user.studentId, password, '', execution);
      if (!result.success) {
        steps.push({ label: 'CAS Login', ok: false, detail: result.needCaptcha ? '需要验证码' : result.message });
        this.recordReAuthFailure(userId);
        if (result.needCaptcha) {
          await this.invalidateSchoolCredentials(userId);
          await this.markInteractiveLoginRequired(userId);
        }
        Logger.auth(user.studentId, '静默重认证失败', 0, Date.now() - start, user.name || undefined, steps);
        return false;
      }
      steps.push({ label: 'CAS Login', ok: true });

      // 4. Portal token
      let portalToken = result.portalToken || null;
      if (!portalToken) {
        const portalResult = await TicketExchanger.exchangePortalToken(client);
        steps.push(...portalResult.steps);
        if (portalResult.token) {
          portalToken = portalResult.token;
        }
      } else {
        steps.push({ label: 'Portal', ok: true });
      }

      // 5. Portal-only recovery stops here: Portal/mobile reads must never activate or replace JW.
      const portalJarJson = client.serializeJar();
      if (requiredSystem === 'portal_only') {
        if (!portalToken) {
          this.recordReAuthFailure(userId);
          return false;
        }
        await this.persistRealSchoolLogin(userId, portalJarJson, portalToken, null);
        Logger.auth(user.studentId, '静默重认证成功', 200, Date.now() - start, user.name || undefined, steps);
        return true;
      }

      // 6. Activate JW session
      const jwResult = await TicketExchanger.exchangeJwSession(client);
      if (!jwResult.success) {
        steps.push({ label: 'JW 激活', ok: false });
        if (portalToken) {
          await this.persistRealSchoolLogin(userId, portalJarJson, portalToken, null);
        }
        if (jwResult.upstreamUnavailable && requiredSystem === 'jw_session') {
          throw new Error('REQUEST_TIMEOUT');
        }
        this.recordReAuthFailure(userId);
        Logger.auth(user.studentId, '静默重认证失败', 0, Date.now() - start, user.name || undefined, steps);
        return false;
      }
      steps.push({ label: 'JW 激活', ok: true });

      // 7. 一次事务提交真实 CAS 登录的新上下文与本次可用基础凭证。
      const jwJarJson = client.serializeJar();
      await this.persistRealSchoolLogin(userId, portalJarJson, portalToken, jwJarJson);
      Logger.auth(user.studentId, '静默重认证成功', 200, Date.now() - start, user.name || undefined, steps);
      return true;
    } catch (e: any) {
      steps.push({ label: '异常', ok: false, detail: e.message });
      Logger.auth(user.studentId, '静默重认证异常', 0, Date.now() - start, user.name || undefined, steps);
      if (isTransientRecoveryError(e)) throw e;
      this.recordReAuthFailure(userId);
      return false;
    }
  }

  private static recordReAuthFailure(userId: number): void {
    const state = reAuthState.get(userId) || { failCount: 0, lastAttempt: 0 };
    state.failCount++;
    state.lastAttempt = Date.now();
    reAuthState.set(userId, state);
  }

  private static async persistRealSchoolLogin(
    userId: number,
    casCookieJar: string,
    portalToken: string | null,
    jwCookieJar: string | null,
  ): Promise<void> {
    const at = new Date();
    getDb().transaction((tx) => {
      advanceSchoolLoginEpoch(tx, userId, at);
      upsertCredentialInTransaction(tx, {
        userId,
        system: 'cas_tgc',
        value: null,
        cookieJar: casCookieJar,
        ttlMs: config.ttl.tgc,
        at,
      });
      if (portalToken) {
        upsertCredentialInTransaction(tx, {
          userId,
          system: 'portal_jwt',
          value: portalToken,
          cookieJar: null,
          ttlMs: config.ttl.portalJwt,
          at,
        });
      } else {
        tx.delete(schema.credentials).where(and(
          eq(schema.credentials.userId, userId),
          eq(schema.credentials.system, 'portal_jwt'),
        )).run();
      }
      if (jwCookieJar) {
        upsertCredentialInTransaction(tx, {
          userId,
          system: 'jw_session',
          value: null,
          cookieJar: jwCookieJar,
          ttlMs: config.ttl.jwSession,
          at,
        });
      }
      tx.delete(schema.credentials).where(and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.system, INTERACTIVE_LOGIN_REQUIRED_SYSTEM),
      )).run();
    });
    reAuthState.delete(userId);
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
