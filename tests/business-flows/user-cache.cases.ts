/**
 * [INPUT]: 依赖 Portal 用户服务、Academic/Portal 缓存服务与可控上游响应
 * [OUTPUT]: 验证资料回填、刷新/旧值回退、凭证错误穿透与损坏缓存清理
 * [POS]: tests/business-flows 的独立能力用例集，由聚合入口在进程级 mock 隔离内装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  eq,
  upstreamState,
  getDb,
  schema,
  config,
  GradeService,
  ScheduleService,
  UserService,
  CacheService,
  CryptoHelper,
  makeSchedulePayload,
  makeUserPayload,
  createUser,
} from './harness';

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

    upstreamState.upstreamResolver = async () => makeUserPayload('李四', '2023001777', '机自25102班');

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

    upstreamState.upstreamExecuteCallback = true;
    upstreamState.upstreamJsonPayload = {
      code: '-1',
      message: 'token 已过期',
    };

    await expect(UserService.getUserInfo(userId, '2023001776', true)).rejects.toThrow('SESSION_EXPIRED');
  });
});

describe('缓存与强制刷新流程', () => {
  it('成绩 HTTP 5xx 不解析也不写入空成绩缓存', async () => {
    upstreamState.upstreamExecuteCallback = true;
    upstreamState.upstreamRequestHandler = async () => new Response(`<html><body>${'服务异常'.repeat(80)}</body></html>`, { status: 503 });

    await expect(GradeService.getGrades(1, '2023001550', {}, false)).rejects.toThrow('GRADE_HTTP_503');
    const rows = await getDb().select().from(schema.cache);
    expect(rows.some((row: any) => row.key.startsWith('grades:2023001550:'))).toBe(false);
  });

  it('refresh=false 命中缓存，refresh=true 强制回源并更新缓存', async () => {
    const first = await GradeService.getGrades(1, '2023001004', { term: '2024-2025-1' }, false);
    expect(first._meta.cached).toBe(false);
    expect(upstreamState.upstreamCallCount).toBe(1);

    const second = await GradeService.getGrades(1, '2023001004', { term: '2024-2025-1' }, false);
    expect(second._meta.cached).toBe(true);
    expect(upstreamState.upstreamCallCount).toBe(1);

    const third = await GradeService.getGrades(1, '2023001004', { term: '2024-2025-1' }, true);
    expect(third._meta.cached).toBe(false);
    expect(upstreamState.upstreamCallCount).toBe(2);
    expect(third.data.items[0].courseName).toBe('grade-v2');
  });

  it('refresh=true 回源失败时回退旧缓存并标记 stale', async () => {
    const first = await GradeService.getGrades(1, '2023001010', { term: '2024-2025-1' }, false);
    expect(first._meta.cached).toBe(false);
    expect(first.data.items[0].courseName).toBe('grade-v1');
    expect(upstreamState.upstreamCallCount).toBe(1);

    upstreamState.upstreamInjectedError = new Error('REQUEST_TIMEOUT');
    const fallback = await GradeService.getGrades(1, '2023001010', { term: '2024-2025-1' }, true);

    expect(upstreamState.upstreamCallCount).toBe(2);
    expect(fallback._meta.cached).toBe(true);
    expect(fallback._meta.stale).toBe(true);
    expect(fallback._meta.refresh_failed).toBe(true);
    expect(fallback._meta.last_error).toBe(3004);
    expect(fallback.data.items[0].courseName).toBe('grade-v1');
  });

  it('refresh=true 回源凭证失效时不允许回退旧缓存', async () => {
    const studentId = '2023001014';
    upstreamState.upstreamResolver = async () => makeSchedulePayload('credential-stale');
    await ScheduleService.getSchedule(1, studentId, '2025-03-05', false);

    upstreamState.upstreamInjectedError = new Error('SESSION_EXPIRED');

    await expect(
      ScheduleService.getSchedule(1, studentId, '2025-03-05', true)
    ).rejects.toThrow('SESSION_EXPIRED');
  });

  it('refresh=true 且上游返回课表未公布时，若有旧缓存仍回退 stale', async () => {
    const studentId = '2023001011';
    upstreamState.upstreamResolver = async () => makeSchedulePayload('initial');
    const first = await ScheduleService.getSchedule(1, studentId, '2025-03-01', false);
    expect(first._meta.cached).toBe(false);

    upstreamState.upstreamInjectedError = new Error('SCHEDULE_NOT_AVAILABLE');
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

    upstreamState.upstreamInjectedError = new Error('REQUEST_TIMEOUT');
    const fallback = await ScheduleService.getSchedule(1, studentId, '2025-03-07', true);

    expect(upstreamState.upstreamCallCount).toBe(1);
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

    upstreamState.upstreamResolver = async () => makeSchedulePayload('expired-cache');
    const first = await ScheduleService.getSchedule(1, studentId, queryDate, false);
    expect(first._meta.cached).toBe(false);
    expect(upstreamState.upstreamCallCount).toBe(1);

    const db = getDb();
    await db.update(schema.cache)
      .set({ expiresAt: new Date(Date.now() - 5_000) })
      .where(eq(schema.cache.key, cacheKey));

    upstreamState.upstreamInjectedError = new Error('REQUEST_TIMEOUT');
    const fallback = await ScheduleService.getSchedule(1, studentId, queryDate, false);

    expect(upstreamState.upstreamCallCount).toBe(2);
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
