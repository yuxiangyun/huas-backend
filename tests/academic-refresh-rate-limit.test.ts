import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test';
import { Hono } from 'hono';

const serviceCalls = {
  grades: 0,
  portalSchedule: 0,
  schedule: 0,
};

mock.module('../src/services/academic/schedule-service.ts', () => ({
  ScheduleService: {
    async getSchedule() {
      serviceCalls.schedule += 1;
      return {
        data: {
          call: serviceCalls.schedule,
          source: 'schedule',
        },
        _meta: { cached: false, source: 'mock' },
      };
    },
  },
}));

mock.module('../src/services/academic/grade-service.ts', () => ({
  GradeService: {
    async getGrades() {
      serviceCalls.grades += 1;
      return {
        data: {
          call: serviceCalls.grades,
          source: 'grades',
        },
        _meta: { cached: false, source: 'mock' },
      };
    },
  },
}));

mock.module('../src/services/portal/portal-schedule-service.ts', () => ({
  PortalScheduleService: {
    async getSchedule() {
      serviceCalls.portalSchedule += 1;
      return {
        data: {
          call: serviceCalls.portalSchedule,
          source: 'portal-schedule',
        },
        _meta: { cached: false, source: 'mock' },
      };
    },
  },
}));

let initDatabase: any;
let getDb: any;
let schema: any;
let registerRoutes: any;
let generateToken: any;
let resetAcademicRefreshRateLimitStateForTests: any;

function createApp() {
  const app = new Hono();
  registerRoutes(app);
  return app;
}

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

async function createUser(studentId: string) {
  const db = getDb();
  const now = new Date();
  const inserted = await db.insert(schema.users).values({
    studentId,
    name: studentId,
    className: 'class-1',
    createdAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
  }).returning({ id: schema.users.id });

  return inserted[0].id as number;
}

async function authHeaderFor(userId: number, studentId: string) {
  const token = await generateToken({ userId, studentId });
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  ({ initDatabase, getDb, schema } = await import('../src/db/index.ts'));
  ({ registerRoutes } = await import('../src/routes/index.ts'));
  ({ generateToken } = await import('../src/auth/jwt.ts'));
  ({ resetAcademicRefreshRateLimitStateForTests } = await import('../src/middleware/academic-refresh-rate-limit.middleware.ts'));
  initDatabase();
});

beforeEach(async () => {
  serviceCalls.grades = 0;
  serviceCalls.portalSchedule = 0;
  serviceCalls.schedule = 0;
  resetAcademicRefreshRateLimitStateForTests();
  await resetDb();
});

describe('教务 refresh 限流', () => {
  it('3 个教务接口共用同一个 refresh 限流桶，第 6 次开始拒绝', async () => {
    const app = createApp();
    const studentId = '2023001001';
    const userId = await createUser(studentId);
    const headers = await authHeaderFor(userId, studentId);

    const allowedPaths = [
      '/api/schedule?refresh=true',
      '/api/grades?refresh=true',
      '/api/v1/schedule?startDate=2025-03-01&endDate=2025-03-07&refresh=true',
      '/api/grades?refresh=true',
      '/api/schedule?refresh=true',
    ];

    for (const path of allowedPaths) {
      const res = await app.request(`http://localhost${path}`, { headers });
      expect(res.status).toBe(200);
    }

    const blocked = await app.request(
      'http://localhost/api/v1/schedule?startDate=2025-03-08&endDate=2025-03-14&refresh=true',
      { headers }
    );

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();

    const body = await blocked.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_message).toContain('教务刷新请求过于频繁');

    expect(serviceCalls.schedule).toBe(2);
    expect(serviceCalls.grades).toBe(2);
    expect(serviceCalls.portalSchedule).toBe(1);
  });

  it('refresh=false 不占用配额，超限后普通请求仍可继续', async () => {
    const app = createApp();
    const studentId = '2023001002';
    const userId = await createUser(studentId);
    const headers = await authHeaderFor(userId, studentId);

    for (let index = 0; index < 8; index += 1) {
      const res = await app.request('http://localhost/api/grades', { headers });
      expect(res.status).toBe(200);
    }

    for (let index = 0; index < 5; index += 1) {
      const res = await app.request('http://localhost/api/grades?refresh=true', { headers });
      expect(res.status).toBe(200);
    }

    const limited = await app.request('http://localhost/api/grades?refresh=true', { headers });
    expect(limited.status).toBe(429);

    const normal = await app.request('http://localhost/api/schedule', { headers });
    expect(normal.status).toBe(200);
  });
});
