/**
 * [INPUT]: 依赖 Bun Test hooks/spy、Hono、SQLite、真实 SchoolAccess 认证/恢复及单次 CAS/TGC 和具名读取替身
 * [OUTPUT]: 提供真实路由装配、上游数据工厂和逐用例隔离；解析用例保留真实具名协议，只替换 HTTP；跟踪资料任务后清理
 * [POS]: tests/business-flows 的隔离进程测试支架，先注册单次协议与移动教务数据替身再装载业务模块，不复制认证、恢复或缓存算法
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import {
  beforeAll,
  afterEach,
  spyOn,
  beforeEach,
  mock,
} from 'bun:test';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { ErrorCode } from '../../src/utils/errors';

// NOTE: 该支架驱动 mock 业务流套件。
// 它在不接入真实学校凭证与网络的情况下验证编排逻辑和回归路径。

type LoginResult = {
  success: boolean;
  message?: string;
  needCaptcha?: boolean;
  credentialsRejected?: boolean;
  portalToken?: string | null;
  steps?: Array<{ label: string; ok: boolean; detail?: string }>;
};

export const authBehavior = {
  getExecution: async (): Promise<string | null> => 'mock-execution',
  getCaptcha: async (): Promise<ArrayBuffer> => new Uint8Array([1, 2, 3]).buffer,
  login: async (_username: string, _password: string, _captcha: string, _execution: string): Promise<LoginResult> => ({
    success: true,
    portalToken: null,
    steps: [],
  }),
};

export const ticketBehavior: {
  exchangeJwSession: (...args: any[]) => Promise<{ success: boolean; steps: any[]; parentRejected?: boolean }>;
  exchangePortalToken: (...args: any[]) => Promise<{ token: string | null; steps: any[]; parentRejected?: boolean }>;
} = {
  exchangeJwSession: async () => ({ success: true, steps: [] }),
  exchangePortalToken: async () => ({ token: 'portal-token-refreshed', steps: [] }),
};

export const upstreamState: {
  upstreamCallCount: number;
  upstreamVersion: number;
  upstreamInjectedError: Error | null;
  upstreamExecuteCallback: boolean;
  upstreamJsonPayload: any;
  upstreamRequestHandler: ((url: string, options?: RequestInit) => Promise<Response>) | null;
  upstreamResolver: (...args: any[]) => Promise<any>;
} = {
  upstreamCallCount: 0,
  upstreamVersion: 0,
  upstreamInjectedError: null,
  upstreamExecuteCallback: false,
  upstreamJsonPayload: null,
  upstreamRequestHandler: null,
  upstreamResolver: async () => undefined,
};

export function addDaysInTest(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00+08:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

export function unfoldIcs(ics: string): string {
  const logicalLines: string[] = [];
  for (const line of ics.split('\r\n')) {
    if (line.startsWith(' ')) {
      logicalLines[logicalLines.length - 1] += line.slice(1);
    } else {
      logicalLines.push(line);
    }
  }
  return logicalLines.join('\r\n');
}

export function makeGradePayload(tag: string) {
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

export function makeSchedulePayload(tag: string) {
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

export function makeUserPayload(name: string, studentId: string, className: string) {
  return {
    name,
    studentId,
    className,
    identity: '学生',
    organizationCode: 'mock-org',
  };
}

// 移动教务保留真实解析、学期完整性及缓存，仅替换只读客户端的学校响应。
mock.module('../../src/modules/campus-integrations/mobile-jw/schedule-client.ts', () => ({
  MobileJwScheduleClient: class {
    async current(userId: number) {
      upstreamState.upstreamCallCount += 1;
      const schedule = await upstreamState.upstreamResolver(userId, 'mobile-jw');
      const { getCurrentWeekRange } = await import('../../src/modules/calendar/domain/calendar');
      const { startDate } = getCurrentWeekRange();
      const courses = schedule.courses.map((course: any) => {
        const [first, last = first] = course.section.split('-').map(Number);
        return {
          courseName: course.name, teacherName: course.teacher, location: course.location,
          classWeek: course.weekStr,
          classTime: String(course.day) + Array.from({ length: last - first + 1 }, (_, i) => String(first + i).padStart(2, '0')).join(''),
        };
      });
      return { data: [{
        week: 1, topInfo: [{ semesterId: '2026-2027-1', maxWeek: 1 }],
        date: Array.from({ length: 7 }, (_, i) => ({ mxrq: addDaysInTest(startDate, i) })),
        nodesLst: Array.from({ length: 12 }, (_, i) => ({ nodeNumber: i + 1 })), courses,
        item: Array.from({ length: 7 }, (_, i) => [courses.filter((course: any) => Number(course.classTime[0]) === i + 1)]),
      }] };
    }
  },
}));

mock.module('../../src/modules/campus-integrations/cas/auth-engine.ts', () => ({
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

mock.module('../../src/modules/campus-integrations/cas/ticket-exchanger.ts', () => ({
  TicketExchanger: {
    exchangeJwSession: (...args: any[]) => ticketBehavior.exchangeJwSession(...args),
    exchangePortalToken: (...args: any[]) => ticketBehavior.exchangePortalToken(...args),
  },
}));

export let getDb: any;
export let schema: any;
export let config: any;
export let authRoutes: any;
export let registerRoutes: any;
export let GradeService: any;
export let ScheduleService: any;
export let PortalScheduleService: any;
export let ECardParser: any;
export let ECardService: any;
export let UserService: any;
export let schoolAccess: typeof import('../../src/modules/campus-integrations/school-access/school-access').schoolAccess;
export let schoolStateStore: typeof import('../../src/modules/campus-integrations/school-access/state-store').schoolStateStore;
export let recovery: import('../../src/modules/campus-integrations/school-access/recovery').SchoolRecovery;
export { requestContext } from '../../src/modules/campus-integrations/school-access/request-executor';

export async function seedCredential(userId: number, system: 'cas_tgc' | 'portal_jwt' | 'jw_session', value: string | null, cookieJar: string | null) {
  const { upsertBaseCredential } = await import('../../src/modules/campus-integrations/school-access/school-login-context');
  upsertBaseCredential(getDb(), { userId, system, value, cookieJar, at: new Date() });
}

export function clearBaseCredentials(userId: number) {
  for (const target of ['cas_tgc', 'portal_jwt', 'jw_session'] as const) {
    const snapshot = schoolStateStore.read(userId, target);
    if (snapshot) schoolStateStore.invalidate(snapshot);
  }
}

const pendingProfiles = new Set<Promise<unknown>>();
export async function drainProfiles() {
  while (pendingProfiles.size) await Promise.allSettled([...pendingProfiles]);
}
let restoreSpies: Array<() => void> = [];
let previousPolicy: import('../../src/modules/academic/domain/schedule-source-policy').ScheduleSourceMode;
export let CacheService: any;
export let CryptoHelper: any;
export let resetAuthLoginRateLimitStateForTests: any;

export async function resetDb() {
  const db = getDb();
  await db.delete(schema.treeholePostLikes);
  await db.delete(schema.treeholeComments);
  await db.delete(schema.treeholePosts);
  await db.delete(schema.discoverComments);
  await db.delete(schema.discoverPostLikes);
  await db.delete(schema.discoverPosts);
  await db.delete(schema.communityProfiles);
  await db.delete(schema.credentials);
  await db.delete(schema.cache);
  await db.delete(schema.users);
}

export async function createUser(studentId: string, password: string) {
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
  ({ getDb, schema } = await import('../../src/db/index.ts'));
  ({ config } = await import('../../src/config.ts'));
  ({ default: authRoutes } = await import('../../src/routes/auth/auth.routes.ts'));
  const routes = await import('../../src/routes/index.ts');
  registerRoutes = (app: Hono) => routes.registerRoutes(app, {
    adminRoutes: new Hono(), communityRoutes: new Hono(), discoverRoutes: new Hono(),
    earlyRisingRoutes: new Hono(), messagingRoutes: new Hono(), notificationRoutes: new Hono(),
    socialSummaryRoutes: new Hono(), treeholeRoutes: new Hono(),
  });
  ({ GradeService } = await import('../../src/services/academic/grade-service.ts'));
  ({ ScheduleService } = await import('../../src/services/academic/schedule-service.ts'));
  ({ PortalScheduleService } = await import('../../src/services/portal/portal-schedule-service.ts'));
  ({ ECardParser } = await import('../../src/parsers/portal/ecard-parser.ts'));
  ({ ECardService } = await import('../../src/services/portal/ecard-service.ts'));
  ({ UserService } = await import('../../src/services/portal/user-service.ts'));
  ({ schoolAccess } = await import('../../src/modules/campus-integrations/school-access/school-access'));
  ({ schoolStateStore } = await import('../../src/modules/campus-integrations/school-access/state-store'));
  ({ CacheService } = await import('../../src/services/infra/cache-service.ts'));
  ({ CryptoHelper } = await import('../../src/utils/crypto.ts'));
  ({ resetAuthLoginRateLimitStateForTests } = await import('../../src/middleware/auth-login-rate-limit.middleware.ts'));
});

beforeEach(async () => {
  const { SchoolRecovery } = await import('../../src/modules/campus-integrations/school-access/recovery');
  recovery = new SchoolRecovery();
  const { HttpClient } = await import('../../src/modules/campus-integrations/http/http-client');
  const realExecute = schoolAccess.execute.bind(schoolAccess);
  const executeSpy = spyOn(schoolAccess, 'execute').mockImplementation((async (userId: number, operation: any, context?: { deadlineAt: number }) => {
    upstreamState.upstreamCallCount += 1;
    if (upstreamState.upstreamInjectedError) throw upstreamState.upstreamInjectedError;
    if (upstreamState.upstreamExecuteCallback) {
      // 解析场景保留真实具名协议、恢复和 parser，仅隔离网络。
      return realExecute(userId, operation, context);
    }
    return upstreamState.upstreamResolver(userId, operation.name.startsWith('jw.') ? 'jw' : 'portal', operation.input, operation.name);
  }) as typeof schoolAccess.execute);
  const httpSpy = spyOn(HttpClient.prototype, 'request').mockImplementation(async (url, options) => {
    if (!upstreamState.upstreamExecuteCallback) throw new Error('UNEXPECTED_SCHOOL_HTTP');
    return upstreamState.upstreamRequestHandler
      ? upstreamState.upstreamRequestHandler(url, options)
      : new Response(JSON.stringify(upstreamState.upstreamJsonPayload), { headers: { 'Content-Type': 'application/json' } });
  });
  const realProfile = UserService.getUserInfo.bind(UserService);
  const profileSpy = spyOn(UserService, 'getUserInfo').mockImplementation((...args: unknown[]) => {
    const pending = Promise.resolve(realProfile(...args));
    pendingProfiles.add(pending);
    void pending.then(() => pendingProfiles.delete(pending), () => pendingProfiles.delete(pending));
    return pending;
  });
  restoreSpies = [() => profileSpy.mockRestore(), () => executeSpy.mockRestore(), () => httpSpy.mockRestore()];
  upstreamState.upstreamCallCount = 0;
  upstreamState.upstreamVersion = 0;
  upstreamState.upstreamInjectedError = null;
  upstreamState.upstreamExecuteCallback = false;
  upstreamState.upstreamJsonPayload = null;
  upstreamState.upstreamRequestHandler = null;
  upstreamState.upstreamResolver = async (userId: number, _mode: string, _input: unknown, operation: string) => {
    if (operation === 'portal.profile') {
      const account = schoolStateStore.account(userId);
      return makeUserPayload('学校姓名', account?.studentId || '', '学校班级');
    }
    if (operation === 'jw.schedule' || operation === 'portal.schedule') return { ...makeSchedulePayload('default'), week: (_input as { startDate?: string }).startDate || '第1周' };
    if (operation !== 'jw.grades') throw new Error(`UNEXPECTED_OPERATION:${operation}`);
    upstreamState.upstreamVersion += 1;
    return makeGradePayload(`grade-v${upstreamState.upstreamVersion}`);
  };

  authBehavior.getExecution = async () => 'mock-execution';
  authBehavior.getCaptcha = async () => new Uint8Array([1, 2, 3]).buffer;
  authBehavior.login = async () => ({ success: true, portalToken: null, steps: [] });

  ticketBehavior.exchangeJwSession = async () => ({ success: true, steps: [] });
  ticketBehavior.exchangePortalToken = async () => ({ token: 'portal-token-refreshed', steps: [] });

  await resetDb();
  resetAuthLoginRateLimitStateForTests();
  const { ScheduleSourcePolicy } = await import('../../src/modules/academic/schedule');
  previousPolicy = (await ScheduleSourcePolicy.status()).mode;
  await ScheduleSourcePolicy.configure('jw-first', 'business-flow-fixture');
});


export { Hono, eq, createHash, ErrorCode };

afterEach(async () => {
  try { await drainProfiles(); }
  finally {
    for (const restore of restoreSpies) restore();
    restoreSpies = [];
    const { ScheduleSourcePolicy } = await import('../../src/modules/academic/schedule');
    await ScheduleSourcePolicy.configure(previousPolicy, 'business-flow-cleanup');
  }
});
