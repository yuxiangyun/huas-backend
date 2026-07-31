/**
 * [INPUT]: 依赖 Bun Test hooks/mock、Hono、测试数据库及 Campus Integrations/Academic/Portal 的可控模块边界
 * [OUTPUT]: 提供跨业务流共享的模块 mock、运行时服务、上游状态、数据工厂与逐用例数据库重置
 * [POS]: tests/business-flows 的隔离进程测试支架，先注册 mock 再延迟装载业务模块，不定义业务断言
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import {
  beforeAll,
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
  portalToken?: string | null;
  steps?: Array<{ label: string; ok: boolean; detail?: string }>;
};

export const authBehavior = {
  getExecution: async (): Promise<string | null> => 'mock-execution',
  getCaptcha: async (): Promise<ArrayBuffer> => new Uint8Array([1, 2, 3]).buffer,
  login: async (): Promise<LoginResult> => ({
    success: true,
    portalToken: null,
    steps: [],
  }),
};

export const ticketBehavior = {
  exchangeJwSession: async () => ({
    success: true,
    steps: [] as Array<{ label: string; ok: boolean; detail?: string }>,
    upstreamUnavailable: false,
  }),
  exchangePortalToken: async () => ({ token: 'portal-token-refreshed', steps: [] as Array<{ label: string; ok: boolean }> }),
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

mock.module('../../src/modules/campus-integrations/upstream/upstream.ts', () => ({
  upstream: async (userId: number, mode: 'jw' | 'portal', fn: (ctx: any) => Promise<any>) => {
    upstreamState.upstreamCallCount += 1;
    if (upstreamState.upstreamInjectedError) {
      throw upstreamState.upstreamInjectedError;
    }
    if (upstreamState.upstreamExecuteCallback) {
      return fn({
        portalToken: 'portal-token-test',
        client: {
          request: async (url: string, options?: RequestInit) => upstreamState.upstreamRequestHandler
            ? upstreamState.upstreamRequestHandler(url, options)
            : new Response(JSON.stringify(upstreamState.upstreamJsonPayload), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
        },
      });
    }
    return upstreamState.upstreamResolver(userId, mode, fn);
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
export let CredentialManager: any;
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
  ({ registerRoutes } = await import('../../src/routes/index.ts'));
  ({ GradeService } = await import('../../src/services/academic/grade-service.ts'));
  ({ ScheduleService } = await import('../../src/services/academic/schedule-service.ts'));
  ({ PortalScheduleService } = await import('../../src/services/portal/portal-schedule-service.ts'));
  ({ ECardParser } = await import('../../src/parsers/portal/ecard-parser.ts'));
  ({ ECardService } = await import('../../src/services/portal/ecard-service.ts'));
  ({ UserService } = await import('../../src/services/portal/user-service.ts'));
  ({ CredentialManager } = await import('../../src/auth/credential-manager.ts'));
  ({ CacheService } = await import('../../src/services/infra/cache-service.ts'));
  ({ CryptoHelper } = await import('../../src/utils/crypto.ts'));
  ({ resetAuthLoginRateLimitStateForTests } = await import('../../src/middleware/auth-login-rate-limit.middleware.ts'));
});

beforeEach(async () => {
  upstreamState.upstreamCallCount = 0;
  upstreamState.upstreamVersion = 0;
  upstreamState.upstreamInjectedError = null;
  upstreamState.upstreamExecuteCallback = false;
  upstreamState.upstreamJsonPayload = null;
  upstreamState.upstreamRequestHandler = null;
  upstreamState.upstreamResolver = async () => {
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
});


export { Hono, eq, createHash, ErrorCode };
