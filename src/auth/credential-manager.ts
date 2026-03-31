import { eq, and, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { HttpClient } from '../core/http-client';
import { AuthEngine } from './auth-engine';
import { TicketExchanger } from './ticket-exchanger';
import { CryptoHelper } from '../utils/crypto';
import { config } from '../config';
import { Logger } from '../utils/logger';

export type CredentialSystem = 'cas_tgc' | 'portal_jwt' | 'jw_session';

// Silent re-auth cooldown tracking
const reAuthState = new Map<number, { failCount: number; lastAttempt: number }>();
const REAUTH_MAX_ATTEMPTS = 3;
const REAUTH_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown after max failures

export class CredentialManager {
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
    const db = getDb();
    const expiresAt = new Date(Date.now() + ttlMs);
    const now = new Date();

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
  static async getCredential(userId: number, system: CredentialSystem): Promise<{
    value: string | null;
    cookieJar: string | null;
  } | null> {
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
    if (cred.expiresAt && cred.expiresAt.getTime() < Date.now()) return null;
    return { value: cred.value, cookieJar: cred.cookieJar };
  }

  /**
   * Get credential with full refresh chain:
   *   1. Return if valid
   *   2. Expired → try refresh via TGC
   *   3. TGC also expired → silent re-auth with stored password
   */
  static async getOrRefreshCredential(userId: number, system: CredentialSystem): Promise<{
    value: string | null;
    cookieJar: string | null;
  } | null> {
    const existing = await this.getCredential(userId, system);
    if (existing) return existing;

    if (system === 'cas_tgc') {
      // TGC expired — only way to get a new one is full CAS login
      const reauthed = await this.silentReAuth(userId);
      if (!reauthed) return null;
      return this.getCredential(userId, 'cas_tgc');
    }

    // Try refresh from TGC first
    const tgc = await this.getCredential(userId, 'cas_tgc');
    if (tgc?.cookieJar) {
      const refreshed = await this.refreshFromTGC(userId, system, tgc.cookieJar);
      if (refreshed) return refreshed;
    }

    // TGC missing or refresh failed — silent re-auth
    Logger.warn('CredentialManager', `${system} 刷新失败, 尝试静默重认证`, undefined, String(userId));
    const reauthed = await this.silentReAuth(userId);
    if (!reauthed) return null;

    // After re-auth, the credential should be fresh
    return this.getCredential(userId, system);
  }

  /**
   * Refresh a sub-credential using a valid TGC
   */
  private static async refreshFromTGC(
    userId: number,
    system: CredentialSystem,
    tgcJar: string
  ): Promise<{ value: string | null; cookieJar: string | null } | null> {
    const client = HttpClient.fromSerializedJar(tgcJar);
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
   */
  static async silentReAuth(userId: number): Promise<boolean> {
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
    const steps: import('../utils/logger').LoginStep[] = [];

    const client = new HttpClient(undefined, config.timeout.cas);
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
        Logger.auth(user.studentId, '静默重认证失败', 0, Date.now() - start, user.name || undefined, steps);
        return false;
      }
      steps.push({ label: 'CAS Login', ok: true });

      // 4. Portal token
      if (result.portalToken) {
        steps.push({ label: 'Portal', ok: true });
      }

      // 5. Activate JW session
      const jwResult = await TicketExchanger.exchangeJwSession(client);
      if (!jwResult.success) {
        steps.push({ label: 'JW 激活', ok: false });
        this.recordReAuthFailure(userId);
        Logger.auth(user.studentId, '静默重认证失败', 0, Date.now() - start, user.name || undefined, steps);
        return false;
      }
      steps.push({ label: 'JW 激活', ok: true });

      // 6. Store all fresh credentials
      const jarJson = client.serializeJar();
      await this.storeCredential(userId, 'cas_tgc', null, jarJson, config.ttl.tgc);
      if (result.portalToken) {
        await this.storeCredential(userId, 'portal_jwt', result.portalToken, null, config.ttl.portalJwt);
      }
      await this.storeCredential(userId, 'jw_session', null, jarJson, config.ttl.jwSession);

      reAuthState.delete(userId);
      Logger.auth(user.studentId, '静默重认证成功', 200, Date.now() - start, user.name || undefined, steps);
      return true;
    } catch (e: any) {
      steps.push({ label: '异常', ok: false, detail: e.message });
      this.recordReAuthFailure(userId);
      Logger.auth(user.studentId, '静默重认证异常', 0, Date.now() - start, user.name || undefined, steps);
      return false;
    }
  }

  private static recordReAuthFailure(userId: number): void {
    const state = reAuthState.get(userId) || { failCount: 0, lastAttempt: 0 };
    state.failCount++;
    state.lastAttempt = Date.now();
    reAuthState.set(userId, state);
  }

  /**
   * Build an HttpClient from stored credential's cookie jar
   */
  static async buildHttpClient(userId: number, system: CredentialSystem): Promise<HttpClient | null> {
    const cred = await this.getOrRefreshCredential(userId, system);
    if (!cred) return null;

    if (cred.cookieJar) {
      return HttpClient.fromSerializedJar(cred.cookieJar);
    }

    // For portal_jwt, we need the TGC's cookie jar
    if (system === 'portal_jwt') {
      const tgc = await this.getCredential(userId, 'cas_tgc');
      if (tgc?.cookieJar) {
        return HttpClient.fromSerializedJar(tgc.cookieJar);
      }
    }

    return new HttpClient();
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
      .where(eq(schema.credentials.userId, userId));
  }

  static async cleanupExpired(): Promise<void> {
    const db = getDb();
    const now = Date.now();
    await db.run(sql`DELETE FROM credentials WHERE expires_at IS NOT NULL AND expires_at < ${now}`);
  }
}
