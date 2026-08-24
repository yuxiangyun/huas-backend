/**
 * [INPUT]: 依赖隔离 SQLite、Early Rising 可注入 Clock/真实仓储与 Hono 路由、Community 详细资料测试端口
 * [OUTPUT]: 覆盖北京时间窗边界、并发幂等语义、连续统计/缺口趋势、连续积分排序、前 100 与独立 me
 * [POS]: tests 的 Early Rising MVP 专项回归，以少量高价值用例锁定事实派生和跨模块批量投影边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { getDb, schema } from '../src/db';
import { onAppError } from '../src/middleware/error.middleware';
import { EarlyRisingApplicationService } from '../src/modules/early-rising/application/early-rising-application-service';
import type { EarlyRisingClock } from '../src/modules/early-rising/application/ports';
import { createEarlyRisingRoutes } from '../src/modules/early-rising/http/early-rising.routes';
import { SQLiteEarlyRisingRepository } from '../src/modules/early-rising/infrastructure/sqlite-early-rising-repository';
import { clearSocialTestData } from './social-database';

const db = getDb();
const repository = new SQLiteEarlyRisingRepository(db);

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
    service: new EarlyRisingApplicationService(repository, profiles, clock),
    profileBatches,
    setNow(value: string) { now = new Date(value); },
  };
}

beforeEach(async () => {
  await clearSocialTestData(db);
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
