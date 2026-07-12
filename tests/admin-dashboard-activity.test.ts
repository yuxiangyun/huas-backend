import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb, initDatabase, schema } from '../src/db';
import { AdminDashboardService } from '../src/services/admin/dashboard-service';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { generateToken } from '../src/auth/jwt';
import { AnalyticsService } from '../src/services/admin/analytics-service';
import { beijingDate } from '../src/utils/time';

async function resetDb() {
  const db = getDb();
  await db.delete(schema.analyticsDailyUsers);
  await db.delete(schema.analyticsDailyMetrics);
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

beforeAll(() => {
  initDatabase();
});

beforeEach(async () => {
  await resetDb();
});

describe('admin dashboard activity metrics', () => {
  it('counts active and new users from millisecond timestamps', async () => {
    const db = getDb();
    const nowMs = Date.now();

    await db.insert(schema.users).values([
      {
        studentId: '2023001001',
        name: 'today-active',
        className: '软件工程1班',
        encryptedPassword: null,
        createdAt: new Date(nowMs - 2 * 60 * 60 * 1000),
        lastLoginAt: new Date(nowMs - 2 * 60 * 60 * 1000),
        lastActiveAt: new Date(nowMs - 10 * 60 * 1000),
      },
      {
        studentId: '2023001002',
        name: 'week-active',
        className: '软件工程2班',
        encryptedPassword: null,
        createdAt: new Date(nowMs - 3 * 24 * 60 * 60 * 1000),
        lastLoginAt: new Date(nowMs - 3 * 24 * 60 * 60 * 1000),
        lastActiveAt: new Date(nowMs - 2 * 24 * 60 * 60 * 1000),
      },
      {
        studentId: '2023001003',
        name: 'inactive',
        className: '软件工程3班',
        encryptedPassword: null,
        createdAt: new Date(nowMs - 10 * 24 * 60 * 60 * 1000),
        lastLoginAt: new Date(nowMs - 10 * 24 * 60 * 60 * 1000),
        lastActiveAt: new Date(nowMs - 8 * 24 * 60 * 60 * 1000),
      },
    ]);

    const dashboard = await AdminDashboardService.getDashboard({ page: '1' });

    expect(dashboard.metrics.totalUsers).toBe(3);
    expect(dashboard.metrics.todayActiveUsers).toBe(1);
    expect(dashboard.metrics.activeUsers7d).toBe(2);
    expect(dashboard.metrics.newUsers7d).toBe(2);
  });

  it('touches lastActiveAt on authenticated requests', async () => {
    const db = getDb();
    const staleActiveAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const inserted = await db.insert(schema.users).values({
      studentId: '2023999001',
      name: 'activity-user',
      className: 'test',
      encryptedPassword: null,
      createdAt: staleActiveAt,
      lastLoginAt: staleActiveAt,
      lastActiveAt: staleActiveAt,
    }).returning({ id: schema.users.id });

    const token = await generateToken({
      userId: inserted[0].id,
      studentId: '2023999001',
      name: 'activity-user',
    });

    const app = new Hono();
    app.use('*', authMiddleware);
    app.get('/protected', (c) => c.json({ success: true }));

    const res = await app.request('http://localhost/protected', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(200);

    const users = await db.select({
      lastActiveAt: schema.users.lastActiveAt,
    }).from(schema.users).where(eq(schema.users.id, inserted[0].id)).limit(1);

    expect(users[0].lastActiveAt).toBeDefined();
    expect(users[0].lastActiveAt.getTime()).toBeGreaterThan(staleActiveAt.getTime());
  });

  it('records one channel DAU and accumulates core feature requests', async () => {
    const db = getDb();
    const now = new Date();
    const inserted = await db.insert(schema.users).values({
      studentId: '2023999002',
      name: 'analytics-user',
      className: 'test',
      createdAt: now,
      lastLoginAt: now,
      lastActiveAt: now,
    }).returning({ id: schema.users.id });
    const token = await generateToken({ userId: inserted[0].id, studentId: '2023999002' });
    const app = new Hono();
    app.use('*', authMiddleware);
    app.get('/api/schedule', (c) => c.json({ success: true }));

    for (let index = 0; index < 2; index += 1) {
      const response = await app.request('http://localhost/api/schedule', {
        headers: { Authorization: `Bearer ${token}`, 'X-Client-Platform': 'miniprogram' },
      });
      expect(response.status).toBe(200);
    }

    const overview = await AnalyticsService.getOverview(7);
    const today = overview.series.find((item) => item.day === beijingDate());
    expect(today?.['active.miniprogram']).toBe(1);
    expect(today?.['feature.schedule.miniprogram']).toBe(2);
    expect(today?.['request.total.miniprogram']).toBe(2);
  });
});
/**
 * [INPUT]: 依赖后台 dashboard/analytics 服务、认证中间件与 SQLite 测试库
 * [OUTPUT]: 验证用户活跃快照、渠道 DAU 与核心功能每日指标
 * [POS]: tests 的后台洞察事实回归套件，保护时间与渠道统计口径
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
