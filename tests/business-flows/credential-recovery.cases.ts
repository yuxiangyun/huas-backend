/**
 * [INPUT]: 依赖真实 SchoolRecovery/SchoolStateStore、正 TTL 播种、学校登录 epoch 与单次 CAS/TGC 协议替身
 * [OUTPUT]: 验证 Portal/JW 目标共享 CAS 后分别恢复与隔离、失败释放、真实 CAS epoch 边界、验证码阻断、超时穿透和激活失败非 401 语义
 * [POS]: tests/business-flows 的独立能力用例集，由聚合入口在进程级 mock 隔离内装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it, spyOn } from 'bun:test';
import { schoolUnavailable, schoolTimeout } from '../../src/modules/campus-integrations/school-access/errors';
import { and } from 'drizzle-orm';
import {
  eq,
  authBehavior,
  ticketBehavior,
  getDb,
  schema,
  schoolStateStore, recovery, requestContext, seedCredential,
  createUser,
} from './harness';
import { readSchoolLoginEpoch } from '../../src/modules/campus-integrations/school-access/school-login-context';

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
  await seedCredential(userId, system, value, cookieJar);
  await getDb().update(schema.credentials)
    .set({ expiresAt: new Date(Date.now() - 1_000) })
    .where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, system),
    ));
}

describe('静默凭证链路', () => {
  it('Portal 目标先启动且 JW 后加入时，共享一次 CAS 后分别取得冻结凭证快照', async () => {
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

    const portalPromise = recovery.ensure(userId, 'portal_jwt', requestContext());
    await casStartedPromise;
    const jwPromise = recovery.ensure(userId, 'jw_session', requestContext());
    releaseCas();

    const [portal, jw] = await Promise.all([portalPromise, jwPromise]);
    expect(portal.value).toBe('portal-from-cas');
    expect(jw.cookieJar).toBeTruthy();
    expect(Object.isFrozen(portal)).toBe(true);
    expect(Object.isFrozen(jw)).toBe(true);
    expect(await schoolStateStore.read(userId, 'jw_session')).not.toBeNull();
    expect(casLoginCount).toBe(1);
    expect(jwExchangeCount).toBe(1);
  });

  it('Portal-only 缺 TGC 时真实 CAS 提交仍不激活或改写已有 JW 行', async () => {
    const userId = await createUser('2023001011', 'pass-portal-only-isolation');
    await seedCredential(userId, 'jw_session', null, '{"cookies":[{"key":"JW","value":"stable"}]}');
    const before = await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, 'jw_session'),
    )).limit(1);
    authBehavior.login = async () => ({ success: true, portalToken: 'portal-only-token', steps: [] });
    ticketBehavior.exchangeJwSession = async () => { throw new Error('JW_MUST_NOT_RUN'); };

    expect((await recovery.ensure(userId, 'portal_jwt', requestContext()))?.value)
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

    const first = recovery.ensure(userId, 'portal_jwt', requestContext());
    const joined = recovery.ensure(userId, 'portal_jwt', requestContext());
    const failures = Promise.all([
      expect(first).rejects.toMatchObject({ code: 3005 }),
      expect(joined).rejects.toMatchObject({ code: 3005 }),
    ]);
    try { await firstStartedPromise; }
    finally { releaseFirst(); await failures; }
    expect(loginCount).toBe(1);

    await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3005 });
    expect(loginCount).toBe(1);
    const now = Date.now() + 5_000;
    const clock = spyOn(Date, 'now').mockReturnValue(now);
    try {
      expect((await recovery.ensure(userId, 'portal_jwt', requestContext()))?.value)
        .toBe('portal-after-failure');
      expect(loginCount).toBe(2);
    } finally { clock.mockRestore(); }
  });

  it('portal_only 中 CAS 成功但 Portal 失败仍推进 epoch 并清理旧派生会话', async () => {
    const userId = await createUser('2023001013', 'pass-portal-failed');
    await insertDerivedSession(userId);
    authBehavior.login = async () => ({ success: true, portalToken: null, steps: [] });
    ticketBehavior.exchangePortalToken = async () => { throw schoolUnavailable(); };

    await expect(recovery.ensure(userId, 'portal_jwt', requestContext()))
      .rejects.toMatchObject({ code: 3005, httpStatus: 503 });
    expect(readSchoolLoginEpoch(getDb(), userId)).toBe(1);
    expect(await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, 'derived_session:mobile_yxt'),
    ))).toHaveLength(0);
  });

  it('JW 目标恢复中 CAS 成功但激活失败仍提交新登录上下文', async () => {
    const userId = await createUser('2023001014', 'pass-full-failed');
    await insertDerivedSession(userId);
    authBehavior.login = async () => ({ success: true, portalToken: null, steps: [] });
    ticketBehavior.exchangePortalToken = async () => { throw schoolUnavailable(); };
    ticketBehavior.exchangeJwSession = async () => { throw schoolUnavailable(); };

    await expect(recovery.ensure(userId, 'jw_session', requestContext()))
      .rejects.toMatchObject({ code: 3005, httpStatus: 503 });
    expect(readSchoolLoginEpoch(getDb(), userId)).toBe(1);
    expect(await schoolStateStore.read(userId, 'cas_tgc')).not.toBeNull();
    expect(await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, 'derived_session:mobile_yxt'),
    ))).toHaveLength(0);
  });

  it('CAS 失败或要求验证码时不推进 epoch，也不清理派生会话', async () => {
    for (const [suffix, needCaptcha] of [['failed', false], ['captcha', true]] as const) {
      const userId = await createUser(`2023001015-${suffix}`, 'pass-cas-rejected');
      await insertDerivedSession(userId);
      authBehavior.login = async () => ({ success: false, needCaptcha, credentialsRejected: !needCaptcha, steps: [] });

      await expect(recovery.ensure(userId, 'cas_tgc', requestContext())).rejects.toMatchObject({ code: 3003 });
      expect(readSchoolLoginEpoch(getDb(), userId)).toBe(0);
      expect(await getDb().select().from(schema.credentials).where(and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.system, 'derived_session:mobile_yxt'),
      ))).toHaveLength(1);
    }
  });

  it('jw_session 过期后在 TGC 有效时可刷新，不触发静默重认证', async () => {
    const userId = await createUser('2023001009', 'pass-jw-refresh');
    await seedCredential(userId, 'cas_tgc', null, '{"cookies":[]}');
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

    const cred = await recovery.ensure(userId, 'jw_session', requestContext());
    expect(cred).not.toBeNull();
    expect(cred?.cookieJar).toBeTruthy();
    expect(silentLoginCalled).toBe(false);
  });

  it('JW 上游不可达时应透传超时，不触发静默重认证', async () => {
    const userId = await createUser('2023001999', 'pass-jw-timeout');
    await seedCredential(userId, 'cas_tgc', null, '{"cookies":[]}');
    await storeExpiredCredential(userId, 'jw_session', null, '{"cookies":[]}');

    let silentLoginCalled = false;
    authBehavior.login = async () => {
      silentLoginCalled = true;
      return { success: false, steps: [] };
    };

    ticketBehavior.exchangeJwSession = async () => { throw schoolTimeout(); };

    await expect(recovery.ensure(userId, 'jw_session', requestContext())).rejects.toMatchObject({ code: 3004 });
    expect(silentLoginCalled).toBe(false);
  });

  it('portal_jwt 过期后优先走 TGC 刷新', async () => {
    const userId = await createUser('2023001002', 'pass-refresh');
    await seedCredential(userId, 'cas_tgc', null, '{"cookies":[]}');
    await storeExpiredCredential(userId, 'portal_jwt', 'stale-token', null);

    ticketBehavior.exchangePortalToken = async () => ({
      token: 'portal-token-new',
      steps: [{ label: 'portal', ok: true }],
    });

    const cred = await recovery.ensure(userId, 'portal_jwt', requestContext());
    expect(cred?.value).toBe('portal-token-new');
  });

  it('Portal TGC 刷新超时保持 3004，不进入静默重登并退化为 3003', async () => {
    const userId = await createUser('2023001008', 'pass-portal-timeout');
    await seedCredential(userId, 'cas_tgc', null, '{"cookies":[]}');
    await storeExpiredCredential(userId, 'portal_jwt', 'stale', null);
    ticketBehavior.exchangePortalToken = async () => { throw new Error('REQUEST_TIMEOUT'); };

    await expect(recovery.ensure(userId, 'portal_jwt', requestContext()))
      .rejects.toMatchObject({ code: 3004 });
  });

  it('等待验证码登录期间跳过静默恢复', async () => {
    const userId = await createUser('2023001006', 'pass-interactive-required');
    await schoolStateStore.markInteraction(userId, schoolStateStore.epoch(userId), 'captcha_required');

    let loginCallCount = 0;
    authBehavior.login = async () => {
      loginCallCount += 1;
      return { success: true, portalToken: 'should-not-run', steps: [] };
    };

    await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3003 });
    expect(loginCallCount).toBe(0);
  });

  it('持久化验证码标记没有 TTL，凭证过期清理不会删除它', async () => {
    const userId = await createUser('2023001007', 'pass-persistent-marker');
    await schoolStateStore.markInteraction(userId, schoolStateStore.epoch(userId), 'captcha_required');

    await schoolStateStore.cleanupExpired();

    expect(await schoolStateStore.requiresInteraction(userId)).toBe(true);
    const credentials = await getDb().select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    expect(credentials).toHaveLength(1);
    expect(credentials[0].system).toBe('interactive_login_required');
    expect(credentials[0].expiresAt).toBeNull();
  });

  it('TGC 不可用时静默认证，只补齐请求所需的 Portal 凭证', async () => {
    const userId = await createUser('2023001003', 'pass-silent');
    await storeExpiredCredential(userId, 'portal_jwt', 'expired-token', null);

    authBehavior.login = async (_username, password) => ({
      success: true,
      portalToken: password === 'pass-silent' ? 'portal-token-silent' : null,
      steps: [],
    });
    ticketBehavior.exchangeJwSession = async () => ({ success: true, steps: [] });

    const cred = await recovery.ensure(userId, 'portal_jwt', requestContext());
    expect(cred?.value).toBe('portal-token-silent');

    const db = getDb();
    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    const systems = creds.map((c: any) => c.system);
    expect(systems.includes('cas_tgc')).toBe(true);
    expect(systems.includes('jw_session')).toBe(false);
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
    ticketBehavior.exchangeJwSession = async () => { throw schoolUnavailable(); };

    const cred = await recovery.ensure(userId, 'portal_jwt', requestContext());
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
    ticketBehavior.exchangeJwSession = async () => { throw schoolUnavailable(); };

    const cred = await recovery.ensure(userId, 'portal_jwt', requestContext());
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
