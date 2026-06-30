import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { ErrorCode } from '../src/utils/errors';

// NOTE: this file is a mocked business-flow suite.
// It validates orchestration logic and regression paths without real school credentials/network.

type LoginResult = {
  success: boolean;
  message?: string;
  needCaptcha?: boolean;
  portalToken?: string | null;
  steps?: Array<{ label: string; ok: boolean; detail?: string }>;
};

const authBehavior = {
  getExecution: async (): Promise<string | null> => 'mock-execution',
  getCaptcha: async (): Promise<ArrayBuffer> => new Uint8Array([1, 2, 3]).buffer,
  login: async (): Promise<LoginResult> => ({
    success: true,
    portalToken: null,
    steps: [],
  }),
};

const ticketBehavior = {
  exchangeJwSession: async () => ({
    success: true,
    steps: [] as Array<{ label: string; ok: boolean; detail?: string }>,
    upstreamUnavailable: false,
  }),
  exchangePortalToken: async () => ({ token: 'portal-token-refreshed', steps: [] as Array<{ label: string; ok: boolean }> }),
};

let upstreamCallCount = 0;
let upstreamVersion = 0;
let upstreamInjectedError: Error | null = null;
let upstreamExecuteCallback = false;
let upstreamJsonPayload: any = null;
let upstreamResolver: (...args: any[]) => Promise<any>;

function addDaysInTest(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00+08:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function makeGradePayload(tag: string) {
  return {
    summary: {
      totalCourses: 1,
      totalCredits: 1,
      averageGpa: 4,
      averageScore: 95,
    },
    items: [
      {
        term: '2024-2025-1',
        courseCode: 'TEST001',
        courseName: tag,
        groupName: '',
        score: 95,
        scoreText: '95',
        pass: true,
        passStatus: 'passed',
        flag: '',
        credit: 1,
        totalHours: 16,
        gpa: 4,
        retakeTerm: '',
        examMethod: '考试',
        examNature: '正常',
        courseAttribute: '必修',
        courseNature: '专业课',
        courseCategory: '测试',
      },
    ],
  };
}

function makeSchedulePayload(tag: string) {
  return {
    week: `week-${tag}`,
    courses: [
      {
        name: `course-${tag}`,
        teacher: 'teacher',
        location: 'room',
        day: 1,
        section: '1-2',
        weekStr: `week-${tag}`,
      },
    ],
    message: '',
  };
}

function makeUserPayload(name: string, studentId: string, className: string) {
  return {
    name,
    studentId,
    className,
    identity: '学生',
    organizationCode: 'mock-org',
  };
}

mock.module('../src/auth/auth-engine.ts', () => ({
  AuthEngine: class {
    constructor(_: any) {}
    async getExecution() {
      return authBehavior.getExecution();
    }
    async getCaptcha() {
      return authBehavior.getCaptcha();
    }
    async login(username: string, password: string, captcha: string, execution: string) {
      return authBehavior.login(username, password, captcha, execution);
    }
  },
}));

mock.module('../src/auth/ticket-exchanger.ts', () => ({
  TicketExchanger: {
    exchangeJwSession: (...args: any[]) => ticketBehavior.exchangeJwSession(...args),
    exchangePortalToken: (...args: any[]) => ticketBehavior.exchangePortalToken(...args),
  },
}));

mock.module('../src/services/infra/upstream.ts', () => ({
  upstream: async (userId: number, mode: 'jw' | 'portal', fn: (ctx: any) => Promise<any>) => {
    upstreamCallCount += 1;
    if (upstreamInjectedError) {
      throw upstreamInjectedError;
    }
    if (upstreamExecuteCallback) {
      return fn({
        portalToken: 'portal-token-test',
        client: {
          request: async () => ({
            json: async () => upstreamJsonPayload,
          }),
        },
      });
    }
    return upstreamResolver(userId, mode, fn);
  },
}));

let initDatabase: any;
let getDb: any;
let schema: any;
let config: any;
let authRoutes: any;
let registerRoutes: any;
let GradeService: any;
let ScheduleService: any;
let PortalScheduleService: any;
let ECardParser: any;
let UserService: any;
let CredentialManager: any;
let CacheService: any;
let CryptoHelper: any;
let resetAuthLoginRateLimitStateForTests: any;

async function resetDb() {
  const db = getDb();
  await db.delete(schema.treeholeCommentNotifications);
  await db.delete(schema.treeholePostLikes);
  await db.delete(schema.treeholeComments);
  await db.delete(schema.treeholePosts);
  await db.delete(schema.discoverComments);
  await db.delete(schema.discoverPostRatings);
  await db.delete(schema.discoverPosts);
  await db.delete(schema.credentials);
  await db.delete(schema.cache);
  await db.delete(schema.users);
}

async function createUser(studentId: string, password: string) {
  const db = getDb();
  const now = new Date();
  const encryptedPassword = CryptoHelper.encryptAES(password, config.jwtSecret);
  const inserted = await db.insert(schema.users).values({
    studentId,
    name: `name-${studentId}`,
    className: 'class-1',
    encryptedPassword,
    createdAt: now,
    lastLoginAt: now,
  }).returning({ id: schema.users.id });
  return inserted[0].id as number;
}

beforeAll(async () => {
  ({ initDatabase, getDb, schema } = await import('../src/db/index.ts'));
  ({ config } = await import('../src/config.ts'));
  ({ default: authRoutes } = await import('../src/routes/auth/auth.routes.ts'));
  ({ registerRoutes } = await import('../src/routes/index.ts'));
  ({ GradeService } = await import('../src/services/academic/grade-service.ts'));
  ({ ScheduleService } = await import('../src/services/academic/schedule-service.ts'));
  ({ PortalScheduleService } = await import('../src/services/portal/portal-schedule-service.ts'));
  ({ ECardParser } = await import('../src/parsers/portal/ecard-parser.ts'));
  ({ UserService } = await import('../src/services/portal/user-service.ts'));
  ({ CredentialManager } = await import('../src/auth/credential-manager.ts'));
  ({ CacheService } = await import('../src/services/infra/cache-service.ts'));
  ({ CryptoHelper } = await import('../src/utils/crypto.ts'));
  ({ resetAuthLoginRateLimitStateForTests } = await import('../src/middleware/auth-login-rate-limit.middleware.ts'));
  initDatabase();
});

beforeEach(async () => {
  upstreamCallCount = 0;
  upstreamVersion = 0;
  upstreamInjectedError = null;
  upstreamExecuteCallback = false;
  upstreamJsonPayload = null;
  upstreamResolver = async () => {
    upstreamVersion += 1;
    return makeGradePayload(`grade-v${upstreamVersion}`);
  };

  authBehavior.getExecution = async () => 'mock-execution';
  authBehavior.getCaptcha = async () => new Uint8Array([1, 2, 3]).buffer;
  authBehavior.login = async () => ({ success: true, portalToken: null, steps: [] });

  ticketBehavior.exchangeJwSession = async () => ({ success: true, steps: [] });
  ticketBehavior.exchangePortalToken = async () => ({ token: 'portal-token-refreshed', steps: [] });

  await resetDb();
  resetAuthLoginRateLimitStateForTests();
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
    expect(systems).toEqual(['cas_tgc', 'jw_session', 'portal_jwt']);
  });

  it('数据库已有用户时可本地登录，不触发 CAS 且无需现有凭证', async () => {
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
    expect(creds.length).toBe(0);
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
    expect(CredentialManager.requiresInteractiveLogin(userId)).toBe(true);

    const db = getDb();
    const staleCreds = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    expect(staleCreds.length).toBe(0);

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
    CredentialManager.markInteractiveLoginRequired(userId);

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
    expect(CredentialManager.requiresInteractiveLogin(userId)).toBe(false);
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
    upstreamResolver = async () => makeUserPayload('张三', '2023001666', '机自25101班');

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
    expect(upstreamCallCount).toBe(1);

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
    upstreamResolver = async () => makeUserPayload('李四', '2023001667', '机自25102班');

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
    upstreamResolver = async () => makeUserPayload('王五', '2023001668', '机自25103班');

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
});

describe('静默凭证链路', () => {
  it('jw_session 过期后在 TGC 有效时可刷新，不触发静默重认证', async () => {
    const userId = await createUser('2023001009', 'pass-jw-refresh');
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    await CredentialManager.storeCredential(userId, 'jw_session', null, '{"cookies":[]}', -1_000);

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
    await CredentialManager.storeCredential(userId, 'jw_session', null, '{"cookies":[]}', -1_000);

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
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'stale-token', null, -1_000);

    ticketBehavior.exchangePortalToken = async () => ({
      token: 'portal-token-new',
      steps: [{ label: 'portal', ok: true }],
    });

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred?.value).toBe('portal-token-new');
  });

  it('等待验证码登录期间跳过静默恢复', async () => {
    const userId = await createUser('2023001006', 'pass-interactive-required');
    CredentialManager.markInteractiveLoginRequired(userId);

    let loginCallCount = 0;
    authBehavior.login = async () => {
      loginCallCount += 1;
      return { success: true, portalToken: 'should-not-run', steps: [] };
    };

    const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
    expect(cred).toBeNull();
    expect(loginCallCount).toBe(0);
  });

  it('TGC 不可用时触发静默重认证并补齐凭证', async () => {
    const userId = await createUser('2023001003', 'pass-silent');
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'expired-token', null, -1_000);

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
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'expired-token', null, -1_000);

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
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'expired-token', null, -1_000);

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

describe('默认课表路由兜底', () => {
  it('JW 课表失败时，/api/schedule 会回退到 portal 课表并标记 source=portal', async () => {
    const userId = await createUser('2023001778', 'pass-schedule-fallback');
    const app = new Hono();
    registerRoutes(app);

    const { generateToken } = await import('../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001778', name: 'name-2023001778' });

    upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'jw') {
        throw new Error('GET_SCHEDULE_FAILED');
      }
      return makeSchedulePayload('portal-route-fallback');
    };

    const res = await app.request('http://localhost/api/schedule?date=2025-03-05', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body._meta?.source).toBe('portal');
    expect(body.data.courses[0].name).toBe('course-portal-route-fallback');
  });

  it('JW 课表失败且 Portal 兜底超时时，/api/schedule 返回更具体的兜底错误', async () => {
    const userId = await createUser('2023001781', 'pass-schedule-timeout');
    const app = new Hono();
    registerRoutes(app);

    const { generateToken } = await import('../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001781', name: 'name-2023001781' });

    upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'jw') {
        throw new Error('GET_SCHEDULE_FAILED');
      }
      throw new Error('REQUEST_TIMEOUT');
    };

    const res = await app.request('http://localhost/api/schedule?date=2025-03-05', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(504);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_code).toBe(ErrorCode.UPSTREAM_TIMEOUT);
  });

  it('Portal 周课表失败时，/api/v1/schedule 会回退到 JW 课表并标记 source=jw', async () => {
    const userId = await createUser('2023001779', 'pass-portal-weekly-fallback');
    const app = new Hono();
    registerRoutes(app);

    const { generateToken } = await import('../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001779', name: 'name-2023001779' });

    upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'portal') {
        throw new Error('GET_SCHEDULE_FAILED');
      }
      return makeSchedulePayload('jw-route-fallback');
    };

    const res = await app.request('http://localhost/api/v1/schedule?startDate=2025-03-03&endDate=2025-03-09', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body._meta?.source).toBe('jw');
    expect(body.data.courses[0].name).toBe('course-jw-route-fallback');
  });

  it('Portal 周课表失败且 JW 兜底超时时，/api/v1/schedule 返回更具体的兜底错误', async () => {
    const userId = await createUser('2023001782', 'pass-portal-timeout');
    const app = new Hono();
    registerRoutes(app);

    const { generateToken } = await import('../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001782', name: 'name-2023001782' });

    upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'portal') {
        throw new Error('GET_SCHEDULE_FAILED');
      }
      throw new Error('REQUEST_TIMEOUT');
    };

    const res = await app.request('http://localhost/api/v1/schedule?startDate=2025-03-03&endDate=2025-03-09', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(504);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_code).toBe(ErrorCode.UPSTREAM_TIMEOUT);
  });

  it('Portal 周课表无数据时，/api/v1/schedule 直接返回空课表而不回退 JW', async () => {
    const userId = await createUser('2023001783', 'pass-portal-empty-week');
    const app = new Hono();
    registerRoutes(app);
    const { generateToken } = await import('../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001783', name: 'name-2023001783' });

    let jwCalled = false;
    upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'jw') {
        jwCalled = true;
        throw new Error('REQUEST_TIMEOUT');
      }
      throw new Error('SCHEDULE_NOT_AVAILABLE');
    };

    const res = await app.request('http://localhost/api/v1/schedule?startDate=2025-02-03&endDate=2025-02-09', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      week: '暂无',
      courses: [],
      message: '课表暂未公布',
    });
    expect(jwCalled).toBe(false);
  });

  it('Portal 非周视图请求失败时，不会错误回退到 JW 周课表', async () => {
    const userId = await createUser('2023001780', 'pass-portal-monthly');
    const app = new Hono();
    registerRoutes(app);

    const { generateToken } = await import('../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001780', name: 'name-2023001780' });

    let jwCalled = false;
    upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'jw') {
        jwCalled = true;
      }
      throw new Error('GET_SCHEDULE_FAILED');
    };

    const res = await app.request('http://localhost/api/v1/schedule?startDate=2025-03-01&endDate=2025-03-31', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(500);
    expect(jwCalled).toBe(false);
  });
});

describe('日历订阅', () => {
  it('固定 token 链接可生成并输出本周 ICS', async () => {
    const userId = await createUser('2023001777', 'pass-calendar');
    const app = new Hono();
    registerRoutes(app);
    const { getCurrentWeekRange } = await import('../src/services/calendar/calendar-subscription-service.ts');
    const currentWeek = getCurrentWeekRange();
    const courseDate = new Date(`${currentWeek.startDate}T00:00:00+08:00`);
    courseDate.setDate(courseDate.getDate() + 1);
    const tuesday = courseDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });

    upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      expect(mode).toBe('portal');
      return {
        week: currentWeek.startDate,
        courses: [
          {
            name: '大学英语',
            teacher: '王老师',
            location: '教B201',
            day: 2,
            section: '1-2',
            weekStr: tuesday,
          },
        ],
      };
    };

    const { generateToken } = await import('../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001777', name: 'name-2023001777' });

    const linkRes = await app.request('http://localhost/api/calendar/link', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(linkRes.status).toBe(200);
    const linkBody = await linkRes.json() as any;
    expect(linkBody.success).toBe(true);
    expect(linkBody.data.url).toContain(`https://calendar.example.test/calendar/schedule.ics?studentId=2023001777&sig=${linkBody.data.sig}`);

    const subscriptionUrl = new URL(linkBody.data.url);
    const icsRes = await app.request(subscriptionUrl.toString());
    expect(icsRes.status).toBe(200);
    expect(icsRes.headers.get('content-type')).toContain('text/calendar');

    const ics = await icsRes.text();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:大学英语');
    expect(ics).toContain(`DTSTART;TZID=Asia/Shanghai:${tuesday.replace(/-/g, '')}T080000`);
    expect(ics).toContain(`DTEND;TZID=Asia/Shanghai:${tuesday.replace(/-/g, '')}T094000`);

    const secondLinkRes = await app.request('http://localhost/api/calendar/link', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const secondLinkBody = await secondLinkRes.json() as any;
    expect(secondLinkBody.data.url).toBe(linkBody.data.url);
  });

  it('门户周课表本周缓存已存在时，日历直接复用同一缓存', async () => {
    const userId = await createUser('2023001999', 'pass-calendar-shared-cache');
    const app = new Hono();
    registerRoutes(app);
    const { getCurrentWeekRange } = await import('../src/services/calendar/calendar-subscription-service.ts');
    const currentWeek = getCurrentWeekRange();

    upstreamCallCount = 0;
    upstreamResolver = async () => ({
      week: '第7周',
      courses: [
        {
          name: '线性代数',
          teacher: '陈老师',
          location: '教C301',
          day: 3,
          section: '3-4',
          weekStr: '星期三(3,4小节)',
        },
      ],
      message: '',
    });

    const portalSchedule = await PortalScheduleService.getSchedule(
      userId,
      '2023001999',
      currentWeek.startDate,
      currentWeek.endDate,
      true,
      'name-2023001999'
    );
    expect(portalSchedule._meta.cached).toBe(false);
    expect(upstreamCallCount).toBe(1);

    const { generateToken } = await import('../src/auth/jwt.ts');
    const authToken = await generateToken({ userId, studentId: '2023001999', name: 'name-2023001999' });
    const linkRes = await app.request('http://localhost/api/calendar/link', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const linkBody = await linkRes.json() as any;
    const subscriptionUrl = new URL(linkBody.data.url);

    const icsRes = await app.request(subscriptionUrl.toString());
    expect(icsRes.status).toBe(200);
    expect(upstreamCallCount).toBe(1);

    const ics = await icsRes.text();
    expect(ics).toContain('SUMMARY:线性代数');
    expect(ics).toContain(`DTSTART;TZID=Asia/Shanghai:${addDaysInTest(currentWeek.startDate, 2).replace(/-/g, '')}T100000`);
  });

  it('订阅链接使用 studentId + HMAC 签名，且与业务 JWT 无关', async () => {
    const { generateCalendarSignature } = await import('../src/auth/calendar-signature.ts');
    expect(generateCalendarSignature('2023001001')).toBe(generateCalendarSignature('2023001001'));
    expect(generateCalendarSignature('2023001001')).not.toBe(generateCalendarSignature('2023001002'));
  });

  it('本周缓存未命中时仅回源一次，后续订阅请求命中缓存', async () => {
    const userId = await createUser('2023001888', 'pass-calendar-cache');
    const app = new Hono();
    registerRoutes(app);
    const { getCurrentWeekRange } = await import('../src/services/calendar/calendar-subscription-service.ts');
    const currentWeek = getCurrentWeekRange();

    const { generateToken } = await import('../src/auth/jwt.ts');
    const authToken = await generateToken({ userId, studentId: '2023001888', name: 'name-2023001888' });

    const requestedModes: Array<'jw' | 'portal'> = [];
    upstreamCallCount = 0;
    upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      requestedModes.push(mode);
      return {
        week: currentWeek.startDate,
        courses: [
          {
            name: '高等数学',
            teacher: '李老师',
            location: '教A101',
            day: 1,
            section: '3-4',
            weekStr: currentWeek.startDate,
          },
        ],
      };
    };

    const linkRes = await app.request('http://localhost/api/calendar/link', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const linkBody = await linkRes.json() as any;
    const subscriptionUrl = new URL(linkBody.data.url);

    const first = await app.request(subscriptionUrl.toString());
    expect(first.status).toBe(200);
    expect(upstreamCallCount).toBe(1);

    const second = await app.request(subscriptionUrl.toString());
    expect(second.status).toBe(200);
    expect(upstreamCallCount).toBe(1);
    expect(requestedModes).toEqual(['portal']);
  });

  it('同名同节次但不同地点的课程会生成不同 UID', async () => {
    const { buildWeeklyScheduleIcs, getCurrentWeekRange } = await import('../src/services/calendar/calendar-subscription-service.ts');
    const currentWeek = getCurrentWeekRange();
    const ics = buildWeeklyScheduleIcs({
      studentId: '2023001222',
      weekStart: currentWeek.startDate,
      courses: [
        {
          name: '大学英语',
          teacher: '王老师',
          location: '教B201',
          day: 2,
          section: '1-2',
          weekStr: addDaysInTest(currentWeek.startDate, 1),
        },
        {
          name: '大学英语',
          teacher: '王老师',
          location: '教B202',
          day: 2,
          section: '1-2',
          weekStr: addDaysInTest(currentWeek.startDate, 1),
        },
      ],
    });

    const uids = ics.split('\r\n')
      .filter((line) => line.startsWith('UID:'));

    expect(uids.length).toBe(2);
    expect(new Set(uids).size).toBe(2);
  });

  it('课程缺少明确日期时，会根据本周起始日和 day 推导事件日期', async () => {
    const { buildWeeklyScheduleIcs, getCurrentWeekRange } = await import('../src/services/calendar/calendar-subscription-service.ts');
    const currentWeek = getCurrentWeekRange(new Date('2026-04-13T08:00:00+08:00'));
    const expectedDate = addDaysInTest(currentWeek.startDate, 4);

    const ics = buildWeeklyScheduleIcs({
      studentId: '2023001333',
      weekStart: currentWeek.startDate,
      courses: [
        {
          name: '大学物理',
          teacher: '周老师',
          location: '教A201',
          day: 5,
          section: '5-6',
          weekStr: '星期五(5,6小节)',
        },
      ],
    });

    expect(ics).toContain(`DTSTART;TZID=Asia/Shanghai:${expectedDate.replace(/-/g, '')}T143000`);
    expect(ics).toContain(`DTEND;TZID=Asia/Shanghai:${expectedDate.replace(/-/g, '')}T161000`);
    expect(ics).toContain(`DESCRIPTION:教师: 周老师\\n地点: 教A201\\n节次: 5-6\\n日期: ${expectedDate}`);
  });
});

describe('用户资料回填', () => {
  it('/api/user 成功后会回写数据库姓名和班级', async () => {
    const db = getDb();
    const now = new Date();
    const inserted = await db.insert(schema.users).values({
      studentId: '2023001777',
      name: null,
      className: null,
      encryptedPassword: CryptoHelper.encryptAES('pass-userinfo', config.jwtSecret),
      createdAt: now,
      lastLoginAt: now,
    }).returning({ id: schema.users.id });

    upstreamResolver = async () => makeUserPayload('李四', '2023001777', '机自25102班');

    const result = await UserService.getUserInfo(inserted[0].id, '2023001777', true);
    expect(result.data.name).toBe('李四');
    expect(result.data.className).toBe('机自25102班');

    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.id, inserted[0].id))
      .limit(1);
    expect(users[0].name).toBe('李四');
    expect(users[0].className).toBe('机自25102班');
  });

  it('UserService 不在 parser 前吞掉 Portal 过期 code', async () => {
    const userId = await createUser('2023001776', 'pass-userinfo-expired');

    upstreamExecuteCallback = true;
    upstreamJsonPayload = {
      code: '-1',
      message: 'token 已过期',
    };

    await expect(UserService.getUserInfo(userId, '2023001776', true)).rejects.toThrow('SESSION_EXPIRED');
  });
});

describe('缓存与强制刷新流程', () => {
  it('refresh=false 命中缓存，refresh=true 强制回源并更新缓存', async () => {
    const first = await GradeService.getGrades(1, '2023001004', { term: '2024-2025-1' }, false);
    expect(first._meta.cached).toBe(false);
    expect(upstreamCallCount).toBe(1);

    const second = await GradeService.getGrades(1, '2023001004', { term: '2024-2025-1' }, false);
    expect(second._meta.cached).toBe(true);
    expect(upstreamCallCount).toBe(1);

    const third = await GradeService.getGrades(1, '2023001004', { term: '2024-2025-1' }, true);
    expect(third._meta.cached).toBe(false);
    expect(upstreamCallCount).toBe(2);
    expect(third.data.items[0].courseName).toBe('grade-v2');
  });

  it('refresh=true 回源失败时回退旧缓存并标记 stale', async () => {
    const first = await GradeService.getGrades(1, '2023001010', { term: '2024-2025-1' }, false);
    expect(first._meta.cached).toBe(false);
    expect(first.data.items[0].courseName).toBe('grade-v1');
    expect(upstreamCallCount).toBe(1);

    upstreamInjectedError = new Error('REQUEST_TIMEOUT');
    const fallback = await GradeService.getGrades(1, '2023001010', { term: '2024-2025-1' }, true);

    expect(upstreamCallCount).toBe(2);
    expect(fallback._meta.cached).toBe(true);
    expect(fallback._meta.stale).toBe(true);
    expect(fallback._meta.refresh_failed).toBe(true);
    expect(fallback._meta.last_error).toBe(3004);
    expect(fallback.data.items[0].courseName).toBe('grade-v1');
  });

  it('refresh=true 且上游返回课表未公布时，若有旧缓存仍回退 stale', async () => {
    const studentId = '2023001011';
    upstreamResolver = async () => makeSchedulePayload('initial');
    const first = await ScheduleService.getSchedule(1, studentId, '2025-03-01', false);
    expect(first._meta.cached).toBe(false);

    upstreamInjectedError = new Error('SCHEDULE_NOT_AVAILABLE');
    const fallback = await ScheduleService.getSchedule(1, studentId, '2025-03-01', true);

    expect(fallback._meta.cached).toBe(true);
    expect(fallback._meta.stale).toBe(true);
    expect(fallback._meta.refresh_failed).toBe(true);
    expect(fallback._meta.last_error).toBe(5000);
  });

  it('refresh=true 且仅存在旧日粒度缓存时，回源失败仍回退 stale', async () => {
    const studentId = '2023001013';
    const legacyCacheKey = `schedule:${studentId}:2025-03-05`;
    await CacheService.set(legacyCacheKey, makeSchedulePayload('legacy-refresh'), 0, 'jw');

    upstreamInjectedError = new Error('REQUEST_TIMEOUT');
    const fallback = await ScheduleService.getSchedule(1, studentId, '2025-03-07', true);

    expect(upstreamCallCount).toBe(1);
    expect(fallback._meta.cached).toBe(true);
    expect(fallback._meta.stale).toBe(true);
    expect(fallback._meta.refresh_failed).toBe(true);
    expect(fallback._meta.last_error).toBe(3004);
    expect(fallback.data.week).toBe('week-legacy-refresh');
    expect(fallback._request.lookup).toBe('legacy');
    expect(fallback._request.promotedFrom).toBe(legacyCacheKey);
  });

  it('refresh=false 且缓存已过期时，回源失败仍回退 stale 缓存', async () => {
    const studentId = '2023001012';
    const queryDate = '2025-03-05';
    const cacheKey = `schedule:${studentId}:2025-03-03`;

    upstreamResolver = async () => makeSchedulePayload('expired-cache');
    const first = await ScheduleService.getSchedule(1, studentId, queryDate, false);
    expect(first._meta.cached).toBe(false);
    expect(upstreamCallCount).toBe(1);

    const db = getDb();
    await db.update(schema.cache)
      .set({ expiresAt: new Date(Date.now() - 5_000) })
      .where(eq(schema.cache.key, cacheKey));

    upstreamInjectedError = new Error('REQUEST_TIMEOUT');
    const fallback = await ScheduleService.getSchedule(1, studentId, queryDate, false);

    expect(upstreamCallCount).toBe(2);
    expect(fallback._meta.cached).toBe(true);
    expect(fallback._meta.stale).toBe(true);
    expect(fallback._meta.refresh_failed).toBe(true);
    expect(fallback._meta.last_error).toBe(3004);
  });

  it('缓存 JSON 损坏时自动清理，避免请求 500', async () => {
    const cacheKey = 'cache:broken-json';
    await CacheService.set(cacheKey, { ok: true }, 60, 'jw');

    const db = getDb();
    await db.update(schema.cache)
      .set({ data: 'not-json' })
      .where(eq(schema.cache.key, cacheKey));

    const cached = await CacheService.get(cacheKey);
    expect(cached).toBeNull();

    const rows = await db.select()
      .from(schema.cache)
      .where(eq(schema.cache.key, cacheKey));
    expect(rows.length).toBe(0);
  });
});

describe('数据库约束与 upsert', () => {
  it('credentials(user_id, system) 唯一键通过 upsert 保持单行', async () => {
    const userId = await createUser('2023001005', 'pass-upsert');
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'v1', null, 60_000);
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'v2', null, 60_000);

    const db = getDb();
    const rows = await db.select()
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId));
    expect(rows.length).toBe(1);
    expect(rows[0].value).toBe('v2');
  });

  it('credentials 表外键生效（不存在用户时插入失败）', async () => {
    const db = getDb();
    const now = new Date();
    let failed = false;

    try {
      await db.insert(schema.credentials).values({
        userId: 999999,
        system: 'portal_jwt',
        value: 'x',
        cookieJar: null,
        expiresAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      failed = true;
    }

    expect(failed).toBe(true);
  });

  it('cache key upsert 更新同 key 数据而不是新增', async () => {
    await CacheService.set('cache:test-key', { version: 1 }, 60, 'jw');
    await CacheService.set('cache:test-key', { version: 2 }, 60, 'jw');

    const db = getDb();
    const rows = await db.select()
      .from(schema.cache)
      .where(eq(schema.cache.key, 'cache:test-key'));
    expect(rows.length).toBe(1);
    expect(JSON.parse(rows[0].data).version).toBe(2);
  });
});

describe('漏洞回归：成绩缓存键放大', () => {
  it('随机查询轰炸后每个用户成绩缓存最多保留 20 条（LRU）', async () => {
    const studentId = '2023001006';

    for (let i = 0; i < 20; i++) {
      await GradeService.getGrades(1, studentId, { kcmc: `course-${i}` }, false);
    }
    expect(upstreamCallCount).toBe(20);

    await GradeService.getGrades(1, studentId, { kcmc: 'course-0' }, false);
    expect(upstreamCallCount).toBe(20);

    await GradeService.getGrades(1, studentId, { kcmc: 'course-20' }, false);
    expect(upstreamCallCount).toBe(21);

    await GradeService.getGrades(1, studentId, { kcmc: 'course-1' }, false);
    expect(upstreamCallCount).toBe(22);

    await GradeService.getGrades(1, studentId, { kcmc: 'course-0' }, false);
    expect(upstreamCallCount).toBe(22);

    const db = getDb();
    const rows = await db.select().from(schema.cache);
    const gradeRows = rows.filter((r: any) => r.key.startsWith(`grades:${studentId}:`));
    expect(gradeRows.length).toBe(20);
  });

  it('成绩查询参数过长时拒绝请求，避免大 key 滥用', async () => {
    await expect(
      GradeService.getGrades(1, '2023001007', { kcmc: 'x'.repeat(200) }, false)
    ).rejects.toThrow('kcmc 参数过长');
  });

  it('缓存 key 使用哈希摘要，长度固定不随输入增长', async () => {
    const studentId = '2023001008';
    const term = '2024-2025-1';
    const kcxz = '';
    const kcmc = 'A'.repeat(64);
    const expectedKey = `grades:${studentId}:${createHash('sha256')
      .update(`${term}\u0000${kcxz}\u0000${kcmc}`)
      .digest('hex')
      .slice(0, 32)}`;

    await GradeService.getGrades(1, studentId, { term, kcxz, kcmc }, false);

    const db = getDb();
    const rows = await db.select()
      .from(schema.cache)
      .where(eq(schema.cache.key, expectedKey));
    expect(rows.length).toBe(1);
    expect(rows[0].key.length).toBe(expectedKey.length);
  });
});

describe('Portal 解析器边界', () => {
  it('ecard 余额缺失时返回 0，格式错误时抛出明确上游错误', () => {
    const missingBalance = ECardParser.parse({ code: 0, data: {} });
    expect(missingBalance?.balance).toBe(0);
    expect(Number.isNaN(missingBalance?.balance)).toBe(false);

    let thrown: any;
    try {
      ECardParser.parse({ code: 0, data: { cardWallet: '余额未知' } });
    } catch (error) {
      thrown = error;
    }

    expect(thrown?.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(thrown?.message).toBe('一卡通余额格式错误');
  });
});

describe('课表缓存与强制刷新防护', () => {
  it('schedule date 参数格式错误时拒绝请求', async () => {
    await expect(
      ScheduleService.getSchedule(1, '2023010001', '2025/03/01', false)
    ).rejects.toThrow('date 参数格式错误');
  });

  it('portal schedule 日期区间和格式校验生效', async () => {
    await expect(
      PortalScheduleService.getSchedule(1, '2023010002', '2025-03-01', '2025-02-28', false)
    ).rejects.toThrow('endDate 不能早于 startDate');

    upstreamExecuteCallback = true;
    upstreamJsonPayload = { code: 0, data: { schedule: {} } };
    const exactMaxRange = await PortalScheduleService.getSchedule(
      1,
      '2023010002',
      '2025-03-01',
      '2025-05-01',
      false
    );
    expect(exactMaxRange.data.week).toBe('2025-03-01');
    expect(upstreamCallCount).toBe(1);

    await expect(
      PortalScheduleService.getSchedule(1, '2023010002', '2025-03-01', '2025-05-02', false)
    ).rejects.toThrow('日期区间不能超过 62 天');
    expect(upstreamCallCount).toBe(1);

    await expect(
      PortalScheduleService.getSchedule(1, '2023010002', '2025-03-01', '2025-06-30', false)
    ).rejects.toThrow('日期区间不能超过 62 天');

    await expect(
      PortalScheduleService.getSchedule(1, '2023010002', '2025/03/01', '2025-03-10', false)
    ).rejects.toThrow('startDate 参数格式错误');
  });

  it('schedule 缓存按用户前缀执行 LRU 限额', async () => {
    const studentId = '2023010003';
    const keep = config.cacheLimit.schedulePerUser;
    const base = new Date('2025-01-01T00:00:00Z');

    for (let i = 0; i < keep + 8; i++) {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + (i * 7));
      const date = d.toISOString().slice(0, 10);
      await ScheduleService.getSchedule(1, studentId, date, false);
    }

    const db = getDb();
    const rows = await db.select().from(schema.cache);
    const scheduleRows = rows.filter((r: any) => r.key.startsWith(`schedule:${studentId}:`));
    expect(scheduleRows.length).toBe(keep);
  });

  it('schedule 未传 date 时按配置时区取当天日期', async () => {
    const studentId = '2023010005';
    const RealDate = Date;
    const fixedNow = new RealDate('2026-03-06T16:30:00.000Z');

    (globalThis as any).Date = class extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedNow.getTime());
          return;
        }
        super(args[0]);
      }

      static now() {
        return fixedNow.getTime();
      }
    } as any;

    try {
      await ScheduleService.getSchedule(1, studentId, undefined, false);
    } finally {
      (globalThis as any).Date = RealDate;
    }

    const db = getDb();
    const rows = await db.select().from(schema.cache);
    const keys = rows.map((r: any) => r.key);
    expect(keys).toContain(`schedule:${studentId}:2026-03-02`);
  });

  it('同一周不同日期请求复用同一缓存 key，首次 miss 后同周请求直接命中缓存', async () => {
    const studentId = '2023010006';
    upstreamResolver = async () => makeSchedulePayload('same-week');

    const first = await ScheduleService.getSchedule(1, studentId, '2025-03-05', false);
    expect(first._meta.cached).toBe(false);
    expect(upstreamCallCount).toBe(1);

    const second = await ScheduleService.getSchedule(1, studentId, '2025-03-07', false);
    expect(second._meta.cached).toBe(true);
    expect(upstreamCallCount).toBe(1);

    const db = getDb();
    const rows = await db.select().from(schema.cache);
    const scheduleRows = rows.filter((r: any) => r.key.startsWith(`schedule:${studentId}:`));
    expect(scheduleRows.length).toBe(1);
    expect(scheduleRows[0].key).toBe(`schedule:${studentId}:2025-03-03`);
  });

  it('同一周已缓存时 refresh=true 仍绕过缓存并更新周粒度 key', async () => {
    const studentId = '2023010007';
    upstreamResolver = async () => {
      upstreamVersion += 1;
      return makeSchedulePayload(`refresh-${upstreamVersion}`);
    };

    const first = await ScheduleService.getSchedule(1, studentId, '2025-03-05', false);
    expect(first._meta.cached).toBe(false);
    expect(first.data.week).toBe('week-refresh-1');
    expect(upstreamCallCount).toBe(1);

    const refreshed = await ScheduleService.getSchedule(1, studentId, '2025-03-06', true);
    expect(refreshed._meta.cached).toBe(false);
    expect(refreshed.data.week).toBe('week-refresh-2');
    expect(upstreamCallCount).toBe(2);

    const db = getDb();
    const rows = await db.select()
      .from(schema.cache)
      .where(eq(schema.cache.key, `schedule:${studentId}:2025-03-03`));
    expect(rows.length).toBe(1);
  });

  it('部署后可复用同周旧日期缓存并回填周粒度 key，避免首波重复回源', async () => {
    const studentId = '2023010008';
    const legacyCacheKey = `schedule:${studentId}:2025-03-05`;
    const weeklyCacheKey = `schedule:${studentId}:2025-03-03`;
    await CacheService.set(legacyCacheKey, makeSchedulePayload('legacy-week'), 0, 'jw');

    const result = await ScheduleService.getSchedule(1, studentId, '2025-03-07', false);
    expect(result._meta.cached).toBe(true);
    expect(result.data.week).toBe('week-legacy-week');
    expect(upstreamCallCount).toBe(0);

    const db = getDb();
    const rows = await db.select()
      .from(schema.cache)
      .where(eq(schema.cache.key, weeklyCacheKey));
    expect(rows.length).toBe(1);
  });

  it('portal schedule 缓存按用户前缀执行 LRU 限额', async () => {
    const studentId = '2023010004';
    const keep = config.cacheLimit.portalSchedulePerUser;
    const base = new Date('2025-01-01T00:00:00Z');

    for (let i = 0; i < keep + 6; i++) {
      const start = new Date(base);
      start.setUTCDate(base.getUTCDate() + i);
      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 7);
      await PortalScheduleService.getSchedule(
        1,
        studentId,
        start.toISOString().slice(0, 10),
        end.toISOString().slice(0, 10),
        false
      );
    }

    const db = getDb();
    const rows = await db.select().from(schema.cache);
    const portalRows = rows.filter((r: any) => r.key.startsWith(`portal-schedule:${studentId}:`));
    expect(portalRows.length).toBe(keep);
  });
});
