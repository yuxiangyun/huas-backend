/**
 * [INPUT]: 依赖后台 dashboard/analytics 服务、认证中间件与 SQLite 测试库
 * [OUTPUT]: 验证用户活跃快照、基础凭证计数、渠道 DAU、显式渠道优先级与历史 unknown 保留口径
 * [POS]: tests 的后台洞察事实回归套件，保护时间、凭证类型、渠道与功能统计边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { createApplicationComposition } from '../src/composition';
import { authMiddleware } from '../src/middleware/auth.middleware';
import { generateToken } from '../src/auth/jwt';
import { AnalyticsService } from '../src/services/admin/analytics-service';
import { beijingDate } from '../src/utils/time';
import { clearSocialTestData } from './social-database';

const composition = createApplicationComposition();
const AdminDashboardService = composition.operations.dashboard;
afterAll(() => composition.dispose());

async function resetDb() {
  const db = getDb();
  await clearSocialTestData(db);
  await db.delete(schema.analyticsDailyMetrics);
}

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

  it('counts only CAS, Portal and JW credentials in the identity metric', async () => {
    const db = getDb();
    const users = await db.insert(schema.users).values({
      studentId: '2023999010',
      name: 'credential-metric-user',
      className: 'test',
    }).returning({ id: schema.users.id });
    const now = new Date();

    await db.insert(schema.credentials).values([
      { userId: users[0].id, system: 'cas_tgc', cookieJar: '{}', expiresAt: new Date(now.getTime() + 60_000) },
      { userId: users[0].id, system: 'portal_jwt', value: 'portal-value', expiresAt: new Date(now.getTime() + 60_000) },
      { userId: users[0].id, system: 'jw_session', cookieJar: '{}', expiresAt: new Date(now.getTime() + 60_000) },
      { userId: users[0].id, system: 'interactive_login_required', value: 'captcha_required', expiresAt: null },
      { userId: users[0].id, system: 'school_login_epoch', value: '7', expiresAt: null },
      { userId: users[0].id, system: 'derived_session:mobile_yxt', value: '{"v":1}', cookieJar: '{}', expiresAt: null },
    ]);

    const dashboard = await AdminDashboardService.getDashboard({ page: '1' });

    const persisted = await db.select({ system: schema.credentials.system }).from(schema.credentials);
    expect(persisted.map((row) => row.system).sort()).toEqual([
      'cas_tgc',
      'derived_session:mobile_yxt',
      'interactive_login_required',
      'jw_session',
      'portal_jwt',
      'school_login_epoch',
    ]);
    expect(dashboard.metrics.credentialEntries).toBe(3);
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

  it('uses an explicit channel header and only falls back for unheaded campus requests', async () => {
    const users = await getDb().insert(schema.users).values([
      { studentId: '2023999003', name: 'explicit-web-user', className: 'test' },
      { studentId: '2023999004', name: 'legacy-miniprogram-user', className: 'test' },
    ]).returning({ id: schema.users.id });

    AnalyticsService.recordAuthenticatedRequest({
      userId: users[0].id,
      platformHeader: 'web',
      path: '/api/schedule',
      status: 200,
    });
    AnalyticsService.recordAuthenticatedRequest({
      userId: users[1].id,
      path: '/api/evaluations/status',
      status: 200,
    });
    AnalyticsService.recordAuthenticatedRequest({
      userId: users[1].id,
      platformHeader: 'miniprogram',
      path: '/api/user',
      status: 200,
    });

    const overview = await AnalyticsService.getOverview(7);
    const today = overview.series.find((item) => item.day === beijingDate());

    expect(today?.['active.web']).toBe(1);
    expect(today?.['active.miniprogram']).toBe(1);
    expect(today?.['feature.schedule.web']).toBe(1);
    expect(today?.['feature.evaluations.miniprogram']).toBe(1);
    expect(today?.['request.total.web']).toBe(1);
    expect(today?.['request.total.miniprogram']).toBe(2);
  });

  it('keeps historical unknown facts separate from the same user miniprogram facts', async () => {
    const db = getDb();
    const day = beijingDate();
    const users = await db.insert(schema.users).values({
      studentId: '2023999005',
      name: 'cross-channel-user',
      className: 'test',
    }).returning({ id: schema.users.id });

    await db.insert(schema.analyticsDailyUsers).values([
      { day, platform: 'unknown', userId: users[0].id },
      { day, platform: 'miniprogram', userId: users[0].id },
    ]);
    await db.insert(schema.analyticsDailyMetrics).values([
      { day, platform: 'unknown', metric: 'feature.schedule', value: 4 },
      { day, platform: 'miniprogram', metric: 'feature.schedule', value: 2 },
    ]);

    const overview = await AnalyticsService.getOverview(7);
    const today = overview.series.find((item) => item.day === day);

    expect(today?.['active.unknown']).toBe(1);
    expect(today?.['active.miniprogram']).toBe(1);
    expect(today?.['feature.schedule.unknown']).toBe(4);
    expect(today?.['feature.schedule.miniprogram']).toBe(2);
  });

  it('does not apply the legacy fallback to an explicit invalid channel header', async () => {
    const db = getDb();
    const users = await db.insert(schema.users).values({
      studentId: '2023999006',
      name: 'invalid-channel-user',
      className: 'test',
    }).returning({ id: schema.users.id });

    for (const platformHeader of ['', ' ', 'unknown', 'native']) {
      AnalyticsService.recordAuthenticatedRequest({
        userId: users[0].id,
        platformHeader,
        path: '/api/schedule',
        status: 200,
      });
    }

    const overview = await AnalyticsService.getOverview(7);
    const today = overview.series.find((item) => item.day === beijingDate());

    expect(today?.['active.unknown']).toBe(1);
    expect(today?.['active.miniprogram']).toBeUndefined();
    expect(today?.['feature.schedule.unknown']).toBe(4);
  });
});
