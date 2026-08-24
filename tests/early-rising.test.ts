/**
 * [INPUT]: 依赖隔离 SQLite、Early Rising 可注入 Clock/真实事实与设置仓储及 Hono 路由、Community 详细资料测试端口
 * [OUTPUT]: 覆盖北京时间窗边界、并发幂等语义、连续统计/缺口趋势、连续积分排序、前 100、独立 me 与个人资料入口设置
 * [POS]: tests 的 Early Rising MVP 专项回归，以少量高价值用例锁定事实派生和跨模块批量投影边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { getDb, schema } from '../src/db';
import { migrateDatabase } from '../src/db/migrator';
import { onAppError } from '../src/middleware/error.middleware';
import { EarlyRisingApplicationService } from '../src/modules/early-rising/application/early-rising-application-service';
import type { EarlyRisingClock } from '../src/modules/early-rising/application/ports';
import { createEarlyRisingRoutes } from '../src/modules/early-rising/http/early-rising.routes';
import { SQLiteEarlyRisingRepository } from '../src/modules/early-rising/infrastructure/sqlite-early-rising-repository';
import { SQLiteEarlyRisingSettingsRepository } from '../src/modules/early-rising/infrastructure/sqlite-early-rising-settings-repository';
import { createAdminRoutes } from '../src/modules/operations/http/admin.routes';
import { clearSocialTestData } from './social-database';

const db = getDb();
const repository = new SQLiteEarlyRisingRepository(db);
const settingsRepository = new SQLiteEarlyRisingSettingsRepository(db);
const scriptTestRoots: string[] = [];

async function createUser(studentId: string) {
  const now = new Date();
  const rows = await db.insert(schema.users).values({
    studentId,
    createdAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
  }).returning({ id: schema.users.id });
  return rows[0]!.id;
}

function createHarness(initialNow: string) {
  let now = new Date(initialNow);
  const clock: EarlyRisingClock = { now: () => new Date(now) };
  const profileBatches: number[][] = [];
  const profiles = {
    async getManyDetailed(userIds: readonly number[]) {
      profileBatches.push([...userIds]);
      return new Map(userIds.map((id) => [id, {
        id,
        displayName: `晨光同学${id}`,
        avatarUrl: null,
        bio: id % 2 ? '保持清醒' : null,
      }]));
    },
  };
  return {
    service: new EarlyRisingApplicationService(repository, settingsRepository, profiles, clock),
    profileBatches,
    setNow(value: string) { now = new Date(value); },
  };
}

beforeEach(async () => {
  await clearSocialTestData(db);
  await settingsRepository.update(true, new Date(0), 'test-reset');
});

afterAll(() => {
  for (const root of scriptTestRoots) rmSync(root, { recursive: true, force: true });
});

describe('Early Rising check-in and personal facts', () => {
  test('uses the half-open Beijing window and returns the original row on duplicate POST', async () => {
    const userId = await createUser('early-boundary');
    const harness = createHarness('2026-08-24T05:29:59.999+08:00');
    await expect(harness.service.checkIn(userId)).rejects.toMatchObject({ code: 4002 });

    harness.setNow('2026-08-24T05:30:00.000+08:00');
    const [concurrentFirst, concurrentSecond] = await Promise.all([
      harness.service.checkIn(userId),
      harness.service.checkIn(userId),
    ]);
    expect(concurrentSecond).toEqual(concurrentFirst);

    const app = new Hono();
    app.onError(onAppError);
    app.use('*', async (c, next) => {
      c.set('userId', userId);
      await next();
    });
    app.route('/early-rising', createEarlyRisingRoutes(harness.service));
    const firstResponse = await app.request('http://localhost/early-rising/check-ins', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checkedAt: '2000-01-01T00:00:00Z', date: '2000-01-01' }),
    });
    expect(firstResponse.status).toBe(200);
    const first = (await firstResponse.json() as any).data;
    expect(first).toMatchObject({
      checkinDate: '2026-08-24',
      checkedAt: '2026-08-24T05:30:00.000+08:00',
    });
    expect(first).toEqual(concurrentFirst);

    harness.setNow('2026-08-24T08:59:00.000+08:00');
    expect(await harness.service.checkIn(userId)).toEqual(first);
    expect(await db.select().from(schema.earlyRisingCheckins)).toHaveLength(1);

    harness.setNow('2026-08-24T09:30:00.000+08:00');
    await expect(harness.service.checkIn(userId)).rejects.toMatchObject({ code: 4002 });
  });

  test('keeps yesterday streak before close, resets after close, and preserves null trend dates', async () => {
    const userId = await createUser('early-stats');
    await repository.createOrGet(userId, '2026-08-20', new Date('2026-08-20T06:10:00+08:00'));
    await repository.createOrGet(userId, '2026-08-21', new Date('2026-08-21T06:20:00+08:00'));
    await repository.createOrGet(userId, '2026-08-23', new Date('2026-08-23T06:30:00+08:00'));
    const harness = createHarness('2026-08-24T08:00:00+08:00');

    expect(await harness.service.getMe(userId)).toMatchObject({
      checkedInToday: false,
      checkedAt: null,
      todayRank: null,
      currentStreak: 1,
      totalValidDays: 3,
      longestStreak: 2,
    });
    const trend = await harness.service.getTrend(userId, {
      from: '2026-08-19',
      to: '2026-08-24',
    });
    expect(trend.range).toEqual({ from: '2026-08-20', to: '2026-08-24' });
    expect(trend.items.map((item) => [item.date, item.checkedAt !== null])).toEqual([
      ['2026-08-20', true],
      ['2026-08-21', true],
      ['2026-08-22', false],
      ['2026-08-23', true],
      ['2026-08-24', false],
    ]);

    harness.setNow('2026-08-24T09:30:00+08:00');
    expect((await harness.service.getMe(userId)).currentStreak).toBe(0);
    const emptyUserId = await createUser('early-empty');
    expect(await harness.service.getTrend(emptyUserId, { month: '2026-08' })).toEqual({
      firstCheckinDate: null,
      range: { from: '2026-08-01', to: '2026-08-24' },
      items: [],
    });
  });
});

describe('Early Rising leaderboards', () => {
  test('inherits streak across Monday and applies continuity score tie-breaks', async () => {
    const firstUserId = await createUser('early-score-a');
    const secondUserId = await createUser('early-score-b');
    for (const date of ['2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27']) {
      await repository.createOrGet(firstUserId, date, new Date(`${date}T06:20:00+08:00`));
    }
    for (const date of ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27']) {
      await repository.createOrGet(secondUserId, date, new Date(`${date}T06:10:00+08:00`));
    }
    const harness = createHarness('2026-08-27T08:00:00+08:00');
    const result = await harness.service.getLeaderboard(secondUserId, 'week');

    expect(result.range).toEqual({ from: '2026-08-24', to: '2026-08-27' });
    expect(result.items.map((item) => ({
      id: item.profile.id,
      score: item.continuityScore,
      days: item.validDays,
      streak: item.currentStreak,
    }))).toEqual([
      { id: firstUserId, score: 14, days: 4, streak: 5 },
      { id: secondUserId, score: 10, days: 4, streak: 4 },
    ]);
    expect(result.me?.rank).toBe(2);
    expect(harness.profileBatches).toEqual([[firstUserId, secondUserId]]);
  });

  test('caps leaders at 100 while returning the current user as an independent me row', async () => {
    const now = new Date('2026-08-24T06:00:00+08:00');
    const users = await db.insert(schema.users).values(Array.from({ length: 101 }, (_, index) => ({
      studentId: `early-rank-${index + 1}`,
      createdAt: now,
      lastLoginAt: now,
      lastActiveAt: now,
    }))).returning({ id: schema.users.id });
    await db.insert(schema.earlyRisingCheckins).values(users.map((user, index) => ({
      userId: user.id,
      checkinDate: '2026-08-24',
      checkedAt: new Date(now.getTime() + index * 1_000),
    })));
    const currentUserId = users.at(-1)!.id;
    const harness = createHarness('2026-08-24T08:00:00+08:00');
    const result = await harness.service.getLeaderboard(currentUserId, 'today');

    expect(result.items).toHaveLength(100);
    expect(result.items[0]?.rank).toBe(1);
    expect(result.items.at(-1)?.rank).toBe(100);
    expect(result.me).toMatchObject({ rank: 101, profile: { id: currentUserId } });
    expect(harness.profileBatches).toHaveLength(1);
    expect(harness.profileBatches[0]).toHaveLength(101);
  });
});

describe('Early Rising display settings', () => {
  test('defaults to visible, persists an audited admin update, and exposes only the client flag', async () => {
    const harness = createHarness('2026-08-24T08:00:00+08:00');
    expect(await harness.service.getClientSettings()).toEqual({ profileEntryVisible: true });

    expect(await harness.service.updateSettings(false, 'linus')).toEqual({
      profileEntryVisible: false,
      updatedAt: '2026-08-24T00:00:00.000Z',
      updatedBy: 'linus',
    });
    expect(await harness.service.getAdminSettings()).toEqual({
      profileEntryVisible: false,
      updatedAt: '2026-08-24T00:00:00.000Z',
      updatedBy: 'linus',
    });

    const app = new Hono();
    app.route('/early-rising', createEarlyRisingRoutes(harness.service));
    const response = await app.request('http://localhost/early-rising/settings');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { profileEntryVisible: false },
    });
  });

  test('protects the admin setting and rejects non-boolean updates', async () => {
    const previousUsername = process.env.ADMIN_USERNAME;
    const previousPassword = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_USERNAME = 'early-admin';
    process.env.ADMIN_PASSWORD = 'early-password';
    try {
      const harness = createHarness('2026-08-24T08:00:00+08:00');
      const app = new Hono();
      app.onError(onAppError);
      app.route('/api/admin', createAdminRoutes({
        dashboard: new Proxy({}, { get: () => async () => ({}) }) as any,
        communityAdmin: new Proxy({}, { get: () => async () => ({}) }) as any,
        messagingAdmin: new Proxy({}, { get: () => async () => ({}) }) as any,
        earlyRisingSettings: harness.service,
      }));

      expect((await app.request('http://localhost/api/admin/early-rising/settings')).status).toBe(401);
      const login = await app.request('http://localhost/api/admin/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'early-admin', password: 'early-password' }),
      });
      const cookie = (login.headers.get('set-cookie') || '').split(';')[0]!;

      const invalid = await app.request('http://localhost/api/admin/early-rising/settings', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ profileEntryVisible: 'false' }),
      });
      expect(invalid.status).toBe(400);

      const updated = await app.request('http://localhost/api/admin/early-rising/settings', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ profileEntryVisible: false }),
      });
      expect(updated.status).toBe(200);
      expect(await updated.json()).toMatchObject({
        data: { profileEntryVisible: false, updatedBy: 'early-admin' },
      });
    } finally {
      if (previousUsername === undefined) delete process.env.ADMIN_USERNAME;
      else process.env.ADMIN_USERNAME = previousUsername;
      if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = previousPassword;
    }
  });
});

describe('Early Rising mock seed script', () => {
  test('uses existing public profiles and undoes only rows recorded by its manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'huas-early-rising-seed-'));
    scriptTestRoots.push(root);
    const dbPath = join(root, 'mock.db');
    const firstManifest = join(root, 'first.json');
    const secondManifest = join(root, 'second.json');
    const database = new Database(dbPath);
    migrateDatabase(database, { allowDestructive: true });
    database.exec(`
      INSERT INTO users (student_id, class_name) VALUES
        ('real-profile-a', '软工24101班'),
        ('real-profile-b', '计科24201班'),
        ('real-profile-c', NULL);
      INSERT INTO community_profiles (user_id, nickname, avatar_url, bio) VALUES
        (1, '晨光甲', '/media/treehole-avatar/a.webp', '真实 Bio'),
        (2, NULL, NULL, NULL);
      INSERT INTO early_rising_checkins (user_id, checkin_date, checked_at)
      VALUES (1, '2020-01-01', 1577800800000);
    `);
    database.close();

    const run = (...args: string[]) => Bun.spawnSync([
      process.execPath,
      'scripts/seed-early-rising-mock.ts',
      '--db',
      dbPath,
      ...args,
    ], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const applied = run('--apply', '--limit', '3', '--days', '5', '--seed', '42', '--manifest', firstManifest);
    expect(applied.exitCode, applied.stderr.toString()).toBe(0);
    const appliedResult = JSON.parse(applied.stdout.toString());
    expect(appliedResult.inserted).toBeGreaterThan(0);
    expect(appliedResult.profiles[0]).toEqual({
      id: 1,
      displayName: '晨光甲',
      avatarUrl: '/media/treehole-avatar/a.webp',
      bio: '真实 Bio',
    });

    const repeated = run('--apply', '--limit', '3', '--days', '5', '--seed', '42', '--manifest', secondManifest);
    expect(repeated.exitCode, repeated.stderr.toString()).toBe(0);
    expect(JSON.parse(repeated.stdout.toString()).inserted).toBe(0);

    const beforeUndo = new Database(dbPath);
    const countBefore = (beforeUndo.query('SELECT count(*) AS count FROM early_rising_checkins').get() as { count: number }).count;
    expect(countBefore).toBe(appliedResult.inserted + 1);
    expect(beforeUndo.query('SELECT nickname, avatar_url, bio FROM community_profiles WHERE user_id = 1').get())
      .toEqual({ nickname: '晨光甲', avatar_url: '/media/treehole-avatar/a.webp', bio: '真实 Bio' });
    beforeUndo.close();

    const undone = run('--undo', firstManifest);
    expect(undone.exitCode, undone.stderr.toString()).toBe(0);
    expect(JSON.parse(undone.stdout.toString())).toMatchObject({
      mode: 'undo',
      removed: appliedResult.inserted,
      alreadyUndone: false,
    });
    const repeatedUndo = run('--undo', firstManifest);
    expect(repeatedUndo.exitCode, repeatedUndo.stderr.toString()).toBe(0);
    expect(JSON.parse(repeatedUndo.stdout.toString()).alreadyUndone).toBe(true);

    const afterUndo = new Database(dbPath);
    expect(afterUndo.query('SELECT id, user_id, checkin_date, checked_at FROM early_rising_checkins').all())
      .toEqual([{ id: 1, user_id: 1, checkin_date: '2020-01-01', checked_at: 1577800800000 }]);
    afterUndo.close();
  });
});
