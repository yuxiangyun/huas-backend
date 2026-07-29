/**
 * [INPUT]: 依赖 认证 mock、测试数据库、登录路由与凭证/用户工厂
 * [OUTPUT]: 验证本地/CAS/验证码/Portal-only 登录、并发 upsert、限流与错误映射
 * [POS]: tests/business-flows 的独立能力用例集，由聚合入口在进程级 mock 隔离内装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  Hono,
  eq,
  ErrorCode,
  authBehavior,
  ticketBehavior,
  upstreamState,
  getDb,
  schema,
  config,
  authRoutes,
  CredentialManager,
  CryptoHelper,
  makeUserPayload,
  createUser,
} from './harness';

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
    expect(systems).toEqual(['cas_tgc', 'jw_session', 'portal_jwt']);
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
    expect(executionCallCount).toBe(0);
    expect(loginCallCount).toBe(0);
  });

  it('本地登录在已有完整上游凭证时可直接返回 token', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const userId = await createUser('2023001445', 'pass-local-portal-only');
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'portal-token-local', null, 60_000);
    await CredentialManager.storeCredential(userId, 'jw_session', null, '{"cookies":[]}', 60_000);

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
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'portal-token-stale', null, 60_000);
    await CredentialManager.storeCredential(userId, 'jw_session', null, '{"cookies":[]}', 60_000);

    authBehavior.login = async () => ({
      success: false,
      needCaptcha: true,
      message: '需要验证码',
      steps: [],
    });

    const silentOk = await CredentialManager.silentReAuth(userId);
    expect(silentOk).toBe(false);
    expect(await CredentialManager.requiresInteractiveLogin(userId)).toBe(true);

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
    await CredentialManager.markInteractiveLoginRequired(userId);

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
    expect(await CredentialManager.requiresInteractiveLogin(userId)).toBe(false);
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

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_code).toBe(3002);
    expect(body.sessionId).toBeUndefined();
    expect(body.needCaptcha).toBeUndefined();
  });

  it('登录失败达到阈值后按学号和 IP 阻断后续请求', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    let loginCallCount = 0;
    authBehavior.login = async () => {
      loginCallCount += 1;
      return { success: false, needCaptcha: false, message: '密码错误', steps: [] };
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
    expect(body.data.user.name).toBe('张三');
    expect(body.data.user.className).toBe('机自25101班');
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
    ticketBehavior.exchangeJwSession = async () => ({
      success: false,
      steps: [{ label: 'jw#1', ok: false, detail: 'status:500' }],
      upstreamUnavailable: false,
    });
    upstreamState.upstreamResolver = async () => makeUserPayload('李四', '2023001667', '机自25102班');

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001667', password: 'pass-portal-only' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.user.name).toBe('李四');
    expect(body.data.user.className).toBe('机自25102班');

    const db = getDb();
    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.studentId, '2023001667'));
    expect(users.length).toBe(1);

    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, users[0].id));
    const systems = creds.map((c: any) => c.system).sort();
    expect(systems).toEqual(['cas_tgc', 'portal_jwt']);
  });

  it('登录阶段未直接拿到 portal token 时，会再走 TGC 换取门户凭证后放行 portal-only 登录', async () => {
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
    ticketBehavior.exchangeJwSession = async () => ({
      success: false,
      steps: [{ label: 'jw#1', ok: false, detail: 'status:500' }],
      upstreamUnavailable: false,
    });
    upstreamState.upstreamResolver = async () => makeUserPayload('王五', '2023001668', '机自25103班');

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001668', password: 'pass-portal-recover' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.user.name).toBe('王五');

    const db = getDb();
    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.studentId, '2023001668'));
    expect(users.length).toBe(1);

    const creds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, users[0].id));
    const portalCred = creds.find((cred: any) => cred.system === 'portal_jwt');
    expect(portalCred?.value).toBe('portal-token-recovered');
    expect(creds.some((cred: any) => cred.system === 'jw_session')).toBe(false);
  });

  it('首次登录 Portal 与 JW 都失败时拒绝签发 token', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    authBehavior.login = async () => ({
      success: true,
      portalToken: null,
      steps: [{ label: 'cas', ok: true }],
    });
    ticketBehavior.exchangePortalToken = async () => ({
      token: null,
      steps: [{ label: 'portal', ok: false }],
    });
    ticketBehavior.exchangeJwSession = async () => ({
      success: false,
      steps: [{ label: 'jw#1', ok: false, detail: 'status:500' }],
      upstreamUnavailable: false,
    });

    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '2023001669', password: 'pass-all-failed' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_message).toBe('学校系统激活失败');
  });

  it('Portal 换票超时返回 3004，不误报凭证或密码错误', async () => {
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

    expect(res.status).toBe(504);
    expect(body.error_code).toBe(ErrorCode.UPSTREAM_TIMEOUT);
  });
});
