/**
 * [INPUT]: 依赖凭证管理器能力感知 singleflight、正 TTL 写入、学校登录 epoch、CAS/TGC 交换 mock 与持久化凭证状态
 * [OUTPUT]: 验证 Portal-only/JW 并发串行补足与隔离、失败释放、真实 CAS epoch 边界、验证码阻断和超时穿透
 * [POS]: tests/business-flows 的独立能力用例集，由聚合入口在进程级 mock 隔离内装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it, spyOn } from 'bun:test';
import { and } from 'drizzle-orm';
import {
  eq,
  authBehavior,
  ticketBehavior,
  getDb,
  schema,
  CredentialManager,
  createUser,
} from './harness';
import { readSchoolLoginEpoch } from '../../src/modules/campus-integrations/credential-recovery/school-login-context';

async function insertDerivedSession(userId: number, system = 'derived_session:mobile_yxt') {
  const now = new Date();
  await getDb().insert(schema.credentials).values({
    userId,
    system,
    value: 'opaque-derived-state',
    cookieJar: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

async function storeExpiredCredential(
  userId: number,
  system: 'portal_jwt' | 'jw_session',
  value: string | null,
  cookieJar: string | null,
) {
  await CredentialManager.storeCredential(userId, system, value, cookieJar, 60_000);
  await getDb().update(schema.credentials)
    .set({ expiresAt: new Date(Date.now() - 1_000) })
    .where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, system),
    ));
}

describe('静默凭证链路', () => {
  it('portal_only 航班先启动且 JW 后加入时，joiner 复用新 TGC 串行补足 JW 且只登录一次 CAS', async () => {
    const userId = await createUser('2023001010', 'pass-capability-join');
    let casLoginCount = 0;
    let releaseCas!: () => void;
    let casStarted!: () => void;
    const casStartedPromise = new Promise<void>((resolve) => { casStarted = resolve; });
    const releaseCasPromise = new Promise<void>((resolve) => { releaseCas = resolve; });
    authBehavior.login = async () => {
      casLoginCount += 1;
      casStarted();
      await releaseCasPromise;
      return { success: true, portalToken: 'portal-from-cas', steps: [] };
    };
    let jwExchangeCount = 0;
    ticketBehavior.exchangeJwSession = async () => {
      jwExchangeCount += 1;
      return { success: true, steps: [] };
    };

    const portalPromise = CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId);
    await casStartedPromise;
    const jwPromise = CredentialManager.getOrRefreshCredential(userId, 'jw_session');
    releaseCas();

    expect((await portalPromise)?.value).toBe('portal-from-cas');
    expect((await jwPromise)?.cookieJar).toBeTruthy();
    expect(await CredentialManager.getCredential(userId, 'jw_session')).not.toBeNull();
    expect(casLoginCount).toBe(1);
    expect(jwExchangeCount).toBe(1);
  });

  it('单独 portal_only 恢复不读取激活或改写已有 JW 行', async () => {
    const userId = await createUser('2023001011', 'pass-portal-only-isolation');
    await CredentialManager.storeCredential(userId, 'jw_session', null, '{"cookies":[{"key":"JW","value":"stable"}]}', 60_000);
    const before = await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, 'jw_session'),
    )).limit(1);
    authBehavior.login = async () => ({ success: true, portalToken: 'portal-only-token', steps: [] });
    ticketBehavior.exchangeJwSession = async () => { throw new Error('JW_MUST_NOT_RUN'); };

    expect((await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId))?.value)
      .toBe('portal-only-token');
    const after = await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, 'jw_session'),
    )).limit(1);
    expect(after).toEqual(before);
  });

  it('共享航班失败后释放状态，后续请求仍可重新恢复', async () => {
    const userId = await createUser('2023001012', 'pass-flight-release');
    let loginCount = 0;
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstStartedPromise = new Promise<void>((resolve) => { firstStarted = resolve; });
    const releaseFirstPromise = new Promise<void>((resolve) => { releaseFirst = resolve; });
    authBehavior.login = async () => {
      loginCount += 1;
      if (loginCount === 1) {
        firstStarted();
        await releaseFirstPromise;
        return { success: false, steps: [] };
      }
      return { success: true, portalToken: 'portal-after-failure', steps: [] };
    };

    const first = CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId);
    const joined = CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId);
    await firstStartedPromise;
    await Promise.resolve();
    await Promise.resolve();
    releaseFirst();
    expect(await first).toBeNull();
    expect(await joined).toBeNull();
    expect(loginCount).toBe(1);

    expect(await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId)).toBeNull();
    expect(loginCount).toBe(1);
    const now = Date.now() + 5_000;
    const clock = spyOn(Date, 'now').mockReturnValue(now);
    try {
      expect((await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId))?.value)
        .toBe('portal-after-failure');
      expect(loginCount).toBe(2);
    } finally { clock.mockRestore(); }
  });

  it('portal_only 中 CAS 成功但 Portal 失败仍推进 epoch 并清理旧派生会话', async () => {
    const userId = await createUser('2023001013', 'pass-portal-failed');
    await insertDerivedSession(userId);
    authBehavior.login = async () => ({ success: true, portalToken: null, steps: [] });
    ticketBehavior.exchangePortalToken = async () => ({ token: null, steps: [] });

    expect(await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId)).toBeNull();
    expect(readSchoolLoginEpoch(getDb(), userId)).toBe(1);
    expect(await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, 'derived_session:mobile_yxt'),
    ))).toHaveLength(0);
  });

  it('完整静默恢复中 CAS 成功但 Portal/JW 都失败仍提交新登录上下文', async () => {
    const userId = await createUser('2023001014', 'pass-full-failed');
    await insertDerivedSession(userId);
    authBehavior.login = async () => ({ success: true, portalToken: null, steps: [] });
    ticketBehavior.exchangePortalToken = async () => ({ token: null, steps: [] });
    ticketBehavior.exchangeJwSession = async () => ({ success: false, steps: [], upstreamUnavailable: false });

    expect(await CredentialManager.getOrRefreshCredential(userId, 'jw_session')).toBeNull();
    expect(readSchoolLoginEpoch(getDb(), userId)).toBe(1);
    expect(await CredentialManager.getCredential(userId, 'cas_tgc')).not.toBeNull();
    expect(await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, 'derived_session:mobile_yxt'),
    ))).toHaveLength(0);
  });

  it('CAS 失败或要求验证码时不推进 epoch，也不清理派生会话', async () => {
    for (const [suffix, needCaptcha] of [['failed', false], ['captcha', true]] as const) {
      const userId = await createUser(`2023001015-${suffix}`, 'pass-cas-rejected');
      await insertDerivedSession(userId);
      authBehavior.login = async () => ({ success: false, needCaptcha, steps: [] });

      expect(await CredentialManager.silentReAuth(userId, undefined, 'jw_session')).toBe(false);
      expect(readSchoolLoginEpoch(getDb(), userId)).toBe(0);
      expect(await getDb().select().from(schema.credentials).where(and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.system, 'derived_session:mobile_yxt'),
      ))).toHaveLength(1);
    }
  });

  it('jw_session 过期后在 TGC 有效时可刷新，不触发静默重认证', async () => {
    const userId = await createUser('2023001009', 'pass-jw-refresh');
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    await storeExpiredCredential(userId, 'jw_session', null, '{"cookies":[]}');

    let silentLoginCalled = false;
    authBehavior.login = async () => {
      silentLoginCalled = true;
      return { success: false, steps: [] };
    };
    ticketBehavior.exchangeJwSession = async () => ({
      success: true,
      steps: [{ label: 'jw', ok: true }],
    });

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'jw_session');
    expect(cred).not.toBeNull();
    expect(cred?.cookieJar).toBeTruthy();
    expect(silentLoginCalled).toBe(false);
  });

  it('JW 上游不可达时应透传超时，不触发静默重认证', async () => {
    const userId = await createUser('2023001999', 'pass-jw-timeout');
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    await storeExpiredCredential(userId, 'jw_session', null, '{"cookies":[]}');

    let silentLoginCalled = false;
    authBehavior.login = async () => {
      silentLoginCalled = true;
      return { success: false, steps: [] };
    };

    ticketBehavior.exchangeJwSession = async () => ({
      success: false,
      steps: [{ label: 'jw#1', ok: false, detail: 'status:0' }],
      upstreamUnavailable: true,
    });

    await expect(CredentialManager.getOrRefreshCredential(userId, 'jw_session')).rejects.toThrow('REQUEST_TIMEOUT');
    expect(silentLoginCalled).toBe(false);
  });

  it('portal_jwt 过期后优先走 TGC 刷新', async () => {
    const userId = await createUser('2023001002', 'pass-refresh');
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    await storeExpiredCredential(userId, 'portal_jwt', 'stale-token', null);

    ticketBehavior.exchangePortalToken = async () => ({
      token: 'portal-token-new',
      steps: [{ label: 'portal', ok: true }],
    });

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred?.value).toBe('portal-token-new');
  });

  it('Portal TGC 刷新超时保持 REQUEST_TIMEOUT，不进入静默重登并退化为 3003', async () => {
    const userId = await createUser('2023001008', 'pass-portal-timeout');
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    await storeExpiredCredential(userId, 'portal_jwt', 'stale', null);
    ticketBehavior.exchangePortalToken = async () => { throw new Error('REQUEST_TIMEOUT'); };

    await expect(CredentialManager.getOrRefreshCredential(userId, 'portal_jwt'))
      .rejects.toThrow('REQUEST_TIMEOUT');
  });

  it('等待验证码登录期间跳过静默恢复', async () => {
    const userId = await createUser('2023001006', 'pass-interactive-required');
    await CredentialManager.markInteractiveLoginRequired(userId);

    let loginCallCount = 0;
    authBehavior.login = async () => {
      loginCallCount += 1;
      return { success: true, portalToken: 'should-not-run', steps: [] };
    };

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred).toBeNull();
    expect(loginCallCount).toBe(0);
  });

  it('持久化验证码标记没有 TTL，凭证过期清理不会删除它', async () => {
    const userId = await createUser('2023001007', 'pass-persistent-marker');
    await CredentialManager.markInteractiveLoginRequired(userId);

    await CredentialManager.cleanupExpired();

    expect(await CredentialManager.requiresInteractiveLogin(userId)).toBe(true);
    const credentials = await getDb().select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    expect(credentials).toHaveLength(1);
    expect(credentials[0].system).toBe('interactive_login_required');
    expect(credentials[0].expiresAt).toBeNull();
  });

  it('TGC 不可用时触发静默重认证并补齐凭证', async () => {
    const userId = await createUser('2023001003', 'pass-silent');
    await storeExpiredCredential(userId, 'portal_jwt', 'expired-token', null);

    authBehavior.login = async (_username, password) => ({
      success: true,
      portalToken: password === 'pass-silent' ? 'portal-token-silent' : null,
      steps: [],
    });
    ticketBehavior.exchangeJwSession = async () => ({ success: true, steps: [] });

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred?.value).toBe('portal-token-silent');

    const db = getDb();
    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    const systems = creds.map((c: any) => c.system);
    expect(systems.includes('cas_tgc')).toBe(true);
    expect(systems.includes('jw_session')).toBe(true);
    expect(systems.includes('portal_jwt')).toBe(true);
  });

  it('静默重认证拿到 portal token 时不受 JW 激活失败影响', async () => {
    const userId = await createUser('2023001004', 'pass-partial');
    await storeExpiredCredential(userId, 'portal_jwt', 'expired-token', null);

    authBehavior.login = async (_username, password) => ({
      success: true,
      portalToken: password === 'pass-partial' ? 'portal-token-partial' : null,
      steps: [],
    });
    ticketBehavior.exchangeJwSession = async () => ({
      success: false,
      steps: [{ label: 'jw#1', ok: false, detail: 'status:500' }],
      upstreamUnavailable: false,
    });

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred?.value).toBe('portal-token-partial');

    const db = getDb();
    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    const systems = creds.map((c: any) => c.system);
    expect(systems.includes('cas_tgc')).toBe(true);
    expect(systems.includes('portal_jwt')).toBe(true);
    expect(systems.includes('jw_session')).toBe(false);
  });

  it('静默重认证未直接拿到 portal token 时，会再走 TGC 换取门户凭证', async () => {
    const userId = await createUser('2023001005', 'pass-portal-recover');
    await storeExpiredCredential(userId, 'portal_jwt', 'expired-token', null);

    authBehavior.login = async () => ({
      success: true,
      portalToken: null,
      steps: [],
    });
    ticketBehavior.exchangePortalToken = async () => ({
      token: 'portal-token-recovered-silent',
      steps: [{ label: 'portal', ok: true }],
    });
    ticketBehavior.exchangeJwSession = async () => ({
      success: false,
      steps: [{ label: 'jw#1', ok: false, detail: 'status:500' }],
      upstreamUnavailable: false,
    });

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred?.value).toBe('portal-token-recovered-silent');

    const db = getDb();
    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    const systems = creds.map((c: any) => c.system);
    expect(systems.includes('cas_tgc')).toBe(true);
    expect(systems.includes('portal_jwt')).toBe(true);
    expect(systems.includes('jw_session')).toBe(false);
  });
});
