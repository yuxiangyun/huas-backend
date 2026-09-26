/**
 * [INPUT]: 依赖单次 CAS/TGC 协议替身、真实 SchoolAuthentication/Identity 路由、SQLite 与可观察的后台资料任务
 * [OUTPUT]: 验证本地快捷、CAS 即时 JWT、验证码一次消费/到期、成功排序、epoch 清理及资料/业务故障不撤销登录
 * [POS]: tests/business-flows 的独立能力用例集，由聚合入口在进程级 mock 隔离内装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it, spyOn } from 'bun:test';
import {
  Hono,
  drainProfiles,
  eq,
  ErrorCode,
  authBehavior,
  ticketBehavior,
  upstreamState,
  getDb,
  schema,
  config,
  authRoutes,
  schoolStateStore, recovery, requestContext, seedCredential, clearBaseCredentials,
  CryptoHelper,
  makeUserPayload,
  createUser,
} from './harness';
import { schoolUnavailable } from '../../src/modules/campus-integrations/school-access/errors';
import { verifyToken } from '../../src/auth/jwt';
import { SchoolAuthentication } from '../../src/modules/campus-integrations/school-access/authentication';
import { SqliteMobileYxtSessionRepository } from '../../src/modules/campus-integrations/mobile-yxt/session-repository';
import { readSchoolLoginEpoch } from '../../src/modules/campus-integrations/school-access/school-login-context';

const validMobileCookieJar = JSON.stringify({
  cookies: [{
    key: 'JSESSIONID',
    value: 'test-mobile-session',
    domain: 'mobile-yxt.huas.edu.cn',
    path: '/server',
    hostOnly: true,
  }],
});

describe('登录流程', () => {
  it('成功登录并写入用户、凭证、返回 token', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001001', password: 'pass-123456' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(typeof body.data?.token).toBe('string');

    const db = getDb();
    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.studentId, '2023001001'));
    expect(users.length).toBe(1);
    expect(users[0].encryptedPassword).toBeTruthy();
    expect(users[0].encryptedPassword).not.toBe('pass-123456');

    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, users[0].id));
    const systems = creds.map((c: any) => c.system).sort();
    expect(systems).toEqual(['cas_tgc', 'school_login_epoch']);
  });

  it('数据库已有用户且无任何学校凭证时仍可本地登录，不访问 CAS', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const userId = await createUser('2023001444', 'pass-local');
    const db = getDb();
    const staleLoginAt = new Date(Date.now() - 60_000);

    await db.update(schema.users)
      .set({ lastLoginAt: staleLoginAt })
      .where(eq(schema.users.id, userId));

    let executionCallCount = 0;
    let loginCallCount = 0;
    authBehavior.getExecution = async () => {
      executionCallCount += 1;
      return 'should-not-run';
    };
    authBehavior.login = async () => {
      loginCallCount += 1;
      return { success: true, portalToken: null, steps: [] };
    };

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001444', password: 'pass-local' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(typeof body.data?.token).toBe('string');

    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    expect(users[0].lastLoginAt.getTime()).toBeGreaterThan(staleLoginAt.getTime());

    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    expect(creds).toHaveLength(0);
    expect(readSchoolLoginEpoch(db, userId)).toBe(0);
    expect(executionCallCount).toBe(0);
    expect(loginCallCount).toBe(0);
  });

  it('本地登录在已有完整上游凭证时可直接返回 token', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const userId = await createUser('2023001445', 'pass-local-portal-only');
    await seedCredential(userId, 'cas_tgc', null, '{"cookies":[]}');
    await seedCredential(userId, 'portal_jwt', 'portal-token-local', null);
    await seedCredential(userId, 'jw_session', null, '{"cookies":[]}');

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001445', password: 'pass-local-portal-only' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(typeof body.data?.token).toBe('string');
  });

  it('静默重认证要求验证码后，下次登录会跳过本地快捷并返回验证码挑战', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const userId = await createUser('2023001446', 'pass-local-captcha');
    await seedCredential(userId, 'cas_tgc', null, '{"cookies":[]}');
    await seedCredential(userId, 'portal_jwt', 'portal-token-stale', null);
    await seedCredential(userId, 'jw_session', null, '{"cookies":[]}');

    authBehavior.login = async () => ({
      success: false,
      needCaptcha: true,
      message: '需要验证码',
      steps: [],
    });

    clearBaseCredentials(userId);
    await expect(recovery.ensure(userId, 'cas_tgc', requestContext())).rejects.toMatchObject({ code: 3003 });
    expect(await schoolStateStore.requiresInteraction(userId)).toBe(true);

    const db = getDb();
    const staleCreds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    expect(staleCreds.map((cred: any) => cred.system)).toEqual(['interactive_login_required']);
    expect(staleCreds[0].value).toBe('captcha_required');
    expect(staleCreds[0].cookieJar).toBeNull();
    expect(staleCreds[0].expiresAt).toBeNull();

    let executionCallCount = 0;
    authBehavior.getExecution = async () => {
      executionCallCount += 1;
      return `exec-${executionCallCount}`;
    };

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001446', password: 'pass-local-captcha' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_code).toBe(ErrorCode.CAPTCHA_ERROR);
    expect(body.needCaptcha).toBe(true);
    expect(typeof body.sessionId).toBe('string');
    expect(executionCallCount).toBe(2);
  });

  it('真实 CAS 登录成功后会清除必须交互登录标记', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const userId = await createUser('2023001447', 'pass-force-cas');
    await schoolStateStore.markInteraction(userId, schoolStateStore.epoch(userId), 'captcha_required');
    const mobileSessions = new SqliteMobileYxtSessionRepository();
    await mobileSessions.createIfLoginEpochMatches({
      userId,
      expectedLoginEpoch: 0,
      accessToken: 'test-stale-mobile-session',
      cookieJar: validMobileCookieJar,
    });

    let loginCallCount = 0;
    authBehavior.login = async () => {
      loginCallCount += 1;
      return { success: true, portalToken: null, steps: [] };
    };

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001447', password: 'pass-force-cas' }),
    });

    expect(res.status).toBe(200);
    expect(loginCallCount).toBe(1);
    expect(await schoolStateStore.requiresInteraction(userId)).toBe(false);
    expect(await mobileSessions.read(userId)).toBeNull();
  });

  it('显式 CAS 成功但 Portal/JW 都失败时提交新 epoch、清理派生会话并立即签发服务 JWT', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const userId = await createUser('2023001448', 'old-password');
    const mobileSessions = new SqliteMobileYxtSessionRepository();
    await mobileSessions.createIfLoginEpochMatches({
      userId,
      expectedLoginEpoch: 0,
      accessToken: 'stale-mobile-access',
      cookieJar: validMobileCookieJar,
    });
    await seedCredential(userId, 'portal_jwt', 'stale-portal', null);

    authBehavior.login = async () => ({ success: true, portalToken: null, steps: [] });
    ticketBehavior.exchangePortalToken = async () => { throw schoolUnavailable(); };
    ticketBehavior.exchangeJwSession = async () => { throw schoolUnavailable(); };

    const response = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001448', password: 'new-password' }),
    });
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.token).toBeString();
    expect(readSchoolLoginEpoch(getDb(), userId)).toBe(1);
    expect(await mobileSessions.read(userId)).toBeNull();
    expect(await schoolStateStore.read(userId, 'cas_tgc')).not.toBeNull();
    expect(await schoolStateStore.read(userId, 'portal_jwt')).toBeNull();
  });

  it('显式 CAS 要求验证码时不推进 epoch，也不清理旧派生会话', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const userId = await createUser('2023001449', 'old-password');
    const mobileSessions = new SqliteMobileYxtSessionRepository();
    const existing = await mobileSessions.createIfLoginEpochMatches({
      userId,
      expectedLoginEpoch: 0,
      accessToken: 'stable-mobile-access',
      cookieJar: validMobileCookieJar,
    });
    authBehavior.login = async () => ({
      success: false,
      needCaptcha: true,
      message: '需要验证码',
      steps: [],
    });

    const response = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001449', password: 'new-password' }),
    });

    expect(response.status).toBe(400);
    expect(readSchoolLoginEpoch(getDb(), userId)).toBe(0);
    expect(await mobileSessions.read(userId)).toEqual(existing);
  });

  it('本地密码不匹配时回退 CAS 并刷新已存密码', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const userId = await createUser('2023001555', 'pass-old');
    let executionCallCount = 0;
    let loginCallCount = 0;

    authBehavior.getExecution = async () => {
      executionCallCount += 1;
      return 'exec-fallback';
    };
    authBehavior.login = async (_username, password) => {
      loginCallCount += 1;
      expect(password).toBe('pass-new');
      return { success: true, portalToken: null, steps: [] };
    };

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001555', password: 'pass-new' }),
    });

    expect(res.status).toBe(200);
    expect(executionCallCount).toBe(1);
    expect(loginCallCount).toBe(1);

    const db = getDb();
    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    expect(CryptoHelper.decryptAES(users[0].encryptedPassword, config.jwtSecret)).toBe('pass-new');
  });

  it('同学号并发登录不会触发唯一键冲突', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const requestBody = JSON.stringify({ username: '2023001886', password: 'pass-concurrent' });

    const [res1, res2] = await Promise.all([
      app.request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      }),
      app.request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const db = getDb();
    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.studentId, '2023001886'));
    expect(users.length).toBe(1);
  });

  it('CAS 要求验证码时返回 challenge，并可用 sessionId + captcha 重试成功', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    let loginCallCount = 0;
    let receivedCaptcha = '';
    let executionCallCount = 0;

    authBehavior.getExecution = async () => {
      executionCallCount += 1;
      return `exec-${executionCallCount}`;
    };
    authBehavior.login = async (_username, _password, captcha) => {
      loginCallCount += 1;
      if (loginCallCount === 1) {
        return { success: false, needCaptcha: true, message: '验证码错误', steps: [] };
      }
      receivedCaptcha = captcha;
      return { success: true, portalToken: null, steps: [] };
    };

    const first = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001999', password: 'pass-captcha' }),
    });
    expect(first.status).toBe(400);
    const firstBody = await first.json() as any;
    expect(firstBody.success).toBe(false);
    expect(firstBody.needCaptcha).toBe(true);
    expect(firstBody.error_message).toBe('验证码错误');
    expect(typeof firstBody.sessionId).toBe('string');
    expect(typeof firstBody.captchaImage).toBe('string');
    expect(firstBody.captchaImage.length).toBeGreaterThan(0);

    const second = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: '2023001999',
        password: 'pass-captcha',
        captcha: 'AB12',
        sessionId: firstBody.sessionId,
      }),
    });
    expect(second.status).toBe(200);
    const secondBody = await second.json() as any;
    expect(secondBody.success).toBe(true);
    expect(receivedCaptcha).toBe('AB12');
    // First request: getExecution once, then create captcha challenge getExecution once.
    // Retry request with valid sessionId should reuse cached execution.
    expect(executionCallCount).toBe(2);
  });

  it('验证码挑战阶段若 execution 初始化失败，返回错误且不下发 sessionId', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    let executionCallCount = 0;
    authBehavior.getExecution = async () => {
      executionCallCount += 1;
      if (executionCallCount === 1) return 'exec-1';
      return null;
    };
    authBehavior.login = async () => ({ success: false, needCaptcha: true, message: '验证码错误', steps: [] });

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001888', password: 'pass-captcha' }),
    });

    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_code).toBe(3005);
    expect(body.sessionId).toBeUndefined();
    expect(body.needCaptcha).toBeUndefined();
  });

  it('登录失败达到阈值后按学号和 IP 阻断后续请求', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    let loginCallCount = 0;
    authBehavior.login = async () => {
      loginCallCount += 1;
      return { success: false, credentialsRejected: true, needCaptcha: false, message: '密码错误', steps: [] };
    };

    for (let index = 0; index < config.authLoginRateLimit.maxFailures; index += 1) {
      const res = await app.request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.10.10.10',
        },
        body: JSON.stringify({ username: '2023001770', password: 'wrong-pass' }),
      });
      expect(res.status).toBe(400);
    }

    const blocked = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.10.10.10',
      },
      body: JSON.stringify({ username: '2023001770', password: 'wrong-pass' }),
    });

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    const body = await blocked.json() as any;
    expect(body.error_code).toBe(ErrorCode.TOO_MANY_REQUESTS);
    expect(body.data.retryAfterSeconds).toBeGreaterThan(0);
    expect(loginCallCount).toBe(config.authLoginRateLimit.maxFailures);
  });

  it('portal token 可用时，登录会回填姓名和班级', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    authBehavior.login = async () => ({
      success: true,
      portalToken: 'portal-token-login',
      steps: [{ label: 'portal', ok: true }],
    });
    upstreamState.upstreamResolver = async () => makeUserPayload('张三', '2023001666', '机自25101班');

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001666', password: 'pass-profile' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.user.name).toBeUndefined();
    expect(body.data.user.className).toBe('');
    await drainProfiles();
    expect(upstreamState.upstreamCallCount).toBe(1);

    const db = getDb();
    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.studentId, '2023001666'));
    expect(users[0].name).toBe('张三');
    expect(users[0].className).toBe('机自25101班');
  });

  it('门户成功时即使 JW 激活失败也允许登录并保存门户凭证', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    authBehavior.login = async () => ({
      success: true,
      portalToken: 'portal-token-partial-login',
      steps: [{ label: 'portal', ok: true }],
    });
    ticketBehavior.exchangeJwSession = async () => { throw schoolUnavailable(); };
    upstreamState.upstreamResolver = async () => makeUserPayload('李四', '2023001667', '机自25102班');

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001667', password: 'pass-portal-only' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.user.name).toBeUndefined();
    await drainProfiles();

    const db = getDb();
    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.studentId, '2023001667'));
    expect(users.length).toBe(1);
    expect(users[0].name).toBe('李四');
    expect(users[0].className).toBe('机自25102班');

    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, users[0].id));
    const systems = creds.map((c: any) => c.system).sort();
    expect(systems).toEqual(['cas_tgc', 'portal_jwt', 'school_login_epoch']);
  });

  it('CAS 未给 Portal 时仍立即登录，后续按需换取门户凭证', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    authBehavior.login = async () => ({
      success: true,
      portalToken: null,
      steps: [{ label: 'portal', ok: true, detail: 'ticket-without-id-token' }],
    });
    ticketBehavior.exchangePortalToken = async () => ({
      token: 'portal-token-recovered',
      steps: [{ label: 'portal', ok: true }],
    });
    ticketBehavior.exchangeJwSession = async () => { throw schoolUnavailable(); };
    upstreamState.upstreamResolver = async () => makeUserPayload('王五', '2023001668', '机自25103班');

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001668', password: 'pass-portal-recover' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.user.name).toBeUndefined();
    await drainProfiles();

    const db = getDb();
    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.studentId, '2023001668'));
    expect(users.length).toBe(1);

    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, users[0].id));
    expect(creds.some((cred: any) => cred.system === 'portal_jwt')).toBe(false);
    expect((await recovery.ensure(users[0].id, 'portal_jwt', requestContext())).value).toBe('portal-token-recovered');
    expect(creds.some((cred: any) => cred.system === 'jw_session')).toBe(false);
  });

  it('首次 CAS 成功不等待 Portal 与 JW，后续能力失败不撤销 token', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    authBehavior.login = async () => ({
      success: true,
      portalToken: null,
      steps: [{ label: 'cas', ok: true }],
    });
    ticketBehavior.exchangePortalToken = async () => { throw schoolUnavailable(); };
    ticketBehavior.exchangeJwSession = async () => { throw schoolUnavailable(); };

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001669', password: 'pass-all-failed' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.token).toBeString();
    const identity = await verifyToken(body.data.token);
    if (!identity) throw new Error('EXPECTED_VALID_JWT');
    await expect(recovery.ensure(identity.userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3005 });
    await expect(recovery.ensure(identity.userId, 'jw_session', requestContext())).rejects.toMatchObject({ code: 3005 });
    expect(schoolStateStore.epoch(identity.userId)).toBe(1);
    expect(await verifyToken(body.data.token)).toEqual(identity);
  });

  it('登录后的 Portal 换票超时返回 3004，已签发 JWT 仍然存在', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    authBehavior.login = async () => ({ success: true, portalToken: null, steps: [] });
    ticketBehavior.exchangePortalToken = async () => { throw new Error('REQUEST_TIMEOUT'); };

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001670', password: 'pass-timeout' }),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.token).toBeString();
    const identity = await verifyToken(body.data.token);
    if (!identity) throw new Error('EXPECTED_VALID_JWT');
    await expect(recovery.ensure(identity.userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3004 });
  });
});

describe('登录后台资料隔离', () => {
  it('资料回源被阻塞时已经返回 JWT，后台失败也不撤销登录', async () => {
    let release!: () => void;
    let began!: () => void;
    const started = new Promise<void>(resolve => { began = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    upstreamState.upstreamResolver = async () => { began(); await gate; throw schoolUnavailable(); };
    const app = new Hono().route('/auth', authRoutes);
    const request = app.request('http://localhost/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'profile-does-not-block', password: 'password' }),
    });
    try {
      await started;
      const response = await request;
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(await verifyToken(body.data.token)).not.toBeNull();
      release();
      await drainProfiles();
      expect(await verifyToken(body.data.token)).not.toBeNull();
    } finally { release(); await request; await drainProfiles(); }
  });
});

// 挑战与排序直接经过真实认证用例；HTTP 登录、JWT 和限流由上方路由场景覆盖。
describe('认证挑战与提交顺序', () => {
  it('验证码会话读取即判过期，消费后不能重放登录 POST', async () => {
    const authentication = new SchoolAuthentication();
    authBehavior.login = async () => ({ success: false, needCaptcha: true, steps: [] });
    const command = { username: 'captcha-once', password: 'password' };
    const first = await authentication.authenticate(command);
    if (first.kind !== 'challenge') throw new Error('EXPECTED_CHALLENGE');
    let posts = 0;
    authBehavior.login = async () => { posts++; return { success: true, steps: [] }; };
    await authentication.authenticate({ ...command, sessionId: first.sessionId, captcha: '1234' });
    await expect(authentication.authenticate({ ...command, sessionId: first.sessionId })).rejects.toMatchObject({ code: 3002 });
    expect(posts).toBe(1);
    authBehavior.login = async () => ({ success: false, needCaptcha: true, steps: [] });
    const next = await authentication.authenticate(command);
    if (next.kind !== 'challenge') throw new Error('EXPECTED_CHALLENGE');
    const clock = spyOn(Date, 'now').mockReturnValue(Date.now() + config.captchaSessionTtl);
    try { await expect(authentication.authenticate({ ...command, sessionId: next.sessionId })).rejects.toMatchObject({ code: 3002 }); }
    finally { clock.mockRestore(); }
  });

  for (const newerSucceeds of [true, false]) {
    it(`较新认证${newerSucceeds ? '成功保护新密码' : '失败不阻挡旧成功'}，迟到响应不能逆序提交`, async () => {
      const authentication = new SchoolAuthentication();
      const studentId = `ordered-login-${newerSucceeds}`;
      let release!: () => void;
      let started!: () => void;
      const began = new Promise<void>(resolve => { started = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      authBehavior.login = async (_username, password) => {
        if (password === 'older') { started(); await gate; return { success: true, portalToken: 'older' }; }
        return { success: newerSucceeds, credentialsRejected: !newerSucceeds, portalToken: 'newer' };
      };
      const old = authentication.authenticate({ username: studentId, password: 'older' });
      await began;
      try { await authentication.authenticate({ username: studentId, password: 'newer' }); }
      finally { release(); await old; }
      const row = getDb().select().from(schema.users).where(eq(schema.users.studentId, studentId)).get();
      expect(CryptoHelper.decryptAES(row.encryptedPassword, config.jwtSecret)).toBe(newerSucceeds ? 'newer' : 'older');
      expect(schoolStateStore.read(row.id, 'portal_jwt')?.value).toBe(newerSucceeds ? 'newer' : 'older');
    });
  }
});
