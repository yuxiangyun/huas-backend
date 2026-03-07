import {
  afterAll,
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
import { rmSync } from 'node:fs';

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
  exchangeJwSession: async () => ({ success: true, steps: [] as Array<{ label: string; ok: boolean }> }),
  exchangePortalToken: async () => ({ token: 'portal-token-refreshed', steps: [] as Array<{ label: string; ok: boolean }> }),
};

let upstreamCallCount = 0;
let upstreamVersion = 0;
let upstreamInjectedError: Error | null = null;

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

mock.module('../src/services/upstream.ts', () => ({
  upstream: async () => {
    upstreamCallCount += 1;
    if (upstreamInjectedError) {
      throw upstreamInjectedError;
    }
    upstreamVersion += 1;
    return makeGradePayload(`grade-v${upstreamVersion}`);
  },
}));

let initDatabase: any;
let getDb: any;
let schema: any;
let config: any;
let authRoutes: any;
let GradeService: any;
let ScheduleService: any;
let PortalScheduleService: any;
let CredentialManager: any;
let CacheService: any;
let CryptoHelper: any;

async function resetDb() {
  const db = getDb();
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
  ({ default: authRoutes } = await import('../src/routes/auth.routes.ts'));
  ({ GradeService } = await import('../src/services/grade-service.ts'));
  ({ ScheduleService } = await import('../src/services/schedule-service.ts'));
  ({ PortalScheduleService } = await import('../src/services/portal-schedule-service.ts'));
  ({ CredentialManager } = await import('../src/auth/credential-manager.ts'));
  ({ CacheService } = await import('../src/services/cache-service.ts'));
  ({ CryptoHelper } = await import('../src/utils/crypto.ts'));
  initDatabase();
});

beforeEach(async () => {
  upstreamCallCount = 0;
  upstreamVersion = 0;
  upstreamInjectedError = null;

  authBehavior.getExecution = async () => 'mock-execution';
  authBehavior.getCaptcha = async () => new Uint8Array([1, 2, 3]).buffer;
  authBehavior.login = async () => ({ success: true, portalToken: null, steps: [] });

  ticketBehavior.exchangeJwSession = async () => ({ success: true, steps: [] });
  ticketBehavior.exchangePortalToken = async () => ({ token: 'portal-token-refreshed', steps: [] });

  await resetDb();
});

afterAll(async () => {
  const testRoot = (globalThis as any).__HUAS_TEST_ROOT__;
  if (testRoot) {
    rmSync(testRoot, { recursive: true, force: true });
  }
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
    expect(systems).toEqual(['cas_tgc', 'jw_session']);
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
    const first = await ScheduleService.getSchedule(1, studentId, '2025-03-01', false);
    expect(first._meta.cached).toBe(false);

    upstreamInjectedError = new Error('SCHEDULE_NOT_AVAILABLE');
    const fallback = await ScheduleService.getSchedule(1, studentId, '2025-03-01', true);

    expect(fallback._meta.cached).toBe(true);
    expect(fallback._meta.stale).toBe(true);
    expect(fallback._meta.refresh_failed).toBe(true);
    expect(fallback._meta.last_error).toBe(5000);
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
      d.setUTCDate(base.getUTCDate() + i);
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
    expect(keys).toContain(`schedule:${studentId}:2026-03-07`);
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
