/**
 * [INPUT]: 依赖 JW/Portal 课表服务、缓存存储、日期工具与可控上游状态
 * [OUTPUT]: 验证日期校验、周粒度缓存、强刷绕过、旧键提升与用户缓存限额
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
  ScheduleService,
  PortalScheduleService,
  CacheService,
  makeSchedulePayload,
} from './harness';

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

    upstreamState.upstreamExecuteCallback = true;
    upstreamState.upstreamJsonPayload = { code: 0, data: { schedule: {} } };
    const exactMaxRange = await PortalScheduleService.getSchedule(
      1,
      '2023010002',
      '2025-03-01',
      '2025-05-01',
      false
    );
    expect(exactMaxRange.data.week).toBe('2025-03-01');
    expect(upstreamState.upstreamCallCount).toBe(1);

    await expect(
      PortalScheduleService.getSchedule(1, '2023010002', '2025-03-01', '2025-05-02', false)
    ).rejects.toThrow('日期区间不能超过 62 天');
    expect(upstreamState.upstreamCallCount).toBe(1);

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
    upstreamState.upstreamResolver = async () => makeSchedulePayload('same-week');

    const first = await ScheduleService.getSchedule(1, studentId, '2025-03-05', false);
    expect(first._meta.cached).toBe(false);
    expect(upstreamState.upstreamCallCount).toBe(1);

    const second = await ScheduleService.getSchedule(1, studentId, '2025-03-07', false);
    expect(second._meta.cached).toBe(true);
    expect(upstreamState.upstreamCallCount).toBe(1);

    const db = getDb();
    const rows = await db.select().from(schema.cache);
    const scheduleRows = rows.filter((r: any) => r.key.startsWith(`schedule:${studentId}:`));
    expect(scheduleRows.length).toBe(1);
    expect(scheduleRows[0].key).toBe(`schedule:${studentId}:2025-03-03`);
  });

  it('同一周已缓存时 refresh=true 仍绕过缓存并更新周粒度 key', async () => {
    const studentId = '2023010007';
    upstreamState.upstreamResolver = async () => {
      upstreamState.upstreamVersion += 1;
      return makeSchedulePayload(`refresh-${upstreamState.upstreamVersion}`);
    };

    const first = await ScheduleService.getSchedule(1, studentId, '2025-03-05', false);
    expect(first._meta.cached).toBe(false);
    expect(first.data.week).toBe('week-refresh-1');
    expect(upstreamState.upstreamCallCount).toBe(1);

    const refreshed = await ScheduleService.getSchedule(1, studentId, '2025-03-06', true);
    expect(refreshed._meta.cached).toBe(false);
    expect(refreshed.data.week).toBe('week-refresh-2');
    expect(upstreamState.upstreamCallCount).toBe(2);

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
    expect(upstreamState.upstreamCallCount).toBe(0);

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
