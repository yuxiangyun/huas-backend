/**
 * [INPUT]: 依赖真实 JW parser/application、课表 Facade、隔离 SQLite 缓存和可控学校响应
 * [OUTPUT]: 验证未公布的跨源编排、历史周/日缓存条件淘汰、真实空表保留及旧课表 stale 回退
 * [POS]: tests 的 JW 未公布状态端到端用例，避免只 mock reader 而遗漏解析到缓存的实际数据流
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ScheduleApplicationService } from '../src/modules/academic/application/schedule-service';
import { ScheduleFacadeApplicationService } from '../src/modules/academic/application/schedule-facade';
import type { AcademicRuntimePorts } from '../src/modules/academic/domain/ports';
import type { ScheduleSourceMode } from '../src/modules/academic/domain/schedule-source-policy';
import { CacheService } from '../src/modules/cache/cache-service';
import { fallbackOnRefreshFailure } from '../src/services/infra/refresh-fallback';

const studentId = 'review-jw-unavailable';
const date = '2026-09-08';
const weekKey = `schedule:${studentId}:2026-09-07`;
const dayKey = `schedule:${studentId}:${date}`;
const unpublished = { week: '暂无', courses: [], message: '课表暂未公布' };
const published = {
  week: '第1周', message: '',
  courses: [{ name: '已公布课程', teacher: '教师', location: '教室', day: 1, section: '1-2', weekStr: '第1周' }],
};
const request = { userId: 1, studentId, date };

beforeEach(async () => {
  for (let day = 7; day <= 13; day++) {
    await CacheService.invalidate(`schedule:${studentId}:2026-09-${String(day).padStart(2, '0')}`);
  }
});

function setup(mode: ScheduleSourceMode = 'jw-first', html = '<html><body>课表暂未公布</body></html>') {
  const calls: string[] = [];
  const ports: AcademicRuntimePorts = {
    cache: CacheService,
    refreshFallback: fallbackOnRefreshFailure,
    upstream: async (_id, _mode, operation) => {
      calls.push('jw');
      return operation({ client: { request: async () => new Response(html) } });
    },
  };
  const jw = new ScheduleApplicationService(ports);
  const portal = {
    getCurrentSchedule: async () => { calls.push('portal'); return { data: published, _meta: { cached: false, source: 'portal' } }; },
    getStaleSchedule: async () => null,
  };
  const mobile = {
    getCurrentSchedule: async () => { calls.push('mobile-jw'); throw new Error('REQUEST_TIMEOUT'); },
    getStaleSchedule: async () => null,
  };
  const facade = new ScheduleFacadeApplicationService(jw, portal, {
    status: async () => ({ mode, updatedAt: 'test', updatedBy: 'test' }),
  }, mobile);
  return { calls, ports, jw, portal, facade };
}

describe('JW 未公布不作为成功课表缓存', () => {
  for (const mode of ['jw-first', 'mobile-jw-first'] as const) {
    it(`${mode} 遇到真实 JW 未公布页面时继续读取 Portal`, async () => {
      const { facade, calls } = setup(mode);
      const result = await facade.getSchedule({ ...request, forceRefresh: true });
      expect(result.data).toEqual(published);
      expect(result._meta.source).toBe('portal');
      expect(calls).toEqual(mode === 'jw-first' ? ['jw', 'portal'] : ['mobile-jw', 'jw', 'portal']);
      expect(await CacheService.get(weekKey, { allowExpired: true })).toBeNull();
    });
  }

  it('所有来源未公布后才返回空表，下一请求仍可取得新公布课表', async () => {
    const { facade, portal, calls } = setup();
    const available = portal.getCurrentSchedule;
    portal.getCurrentSchedule = async () => { calls.push('portal'); throw new Error('SCHEDULE_NOT_AVAILABLE'); };
    expect((await facade.getSchedule(request)).data).toEqual(unpublished);
    expect(calls).toEqual(['jw', 'portal']);
    expect(await CacheService.get(weekKey, { allowExpired: true })).toBeNull();
    portal.getCurrentSchedule = available;
    expect((await facade.getSchedule(request)).data).toEqual(published);
  });

  it('完整的合法无课表仍可缓存并命中', async () => {
    const { facade, calls } = setup('jw-first', '<table class="kb_table"><tbody></tbody></table>');
    const first = await facade.getSchedule(request);
    expect(first.data.courses).toEqual([]);
    expect(first.data.message).toBe('');
    expect((await facade.getSchedule(request))._meta.cached).toBe(true);
    expect(calls).toEqual(['jw']);
  });

  it('非教学周仍保留合法空表语义', async () => {
    const { facade } = setup('jw-first', '<script>$("#li_showWeek").html("当前日期不在教学周历内");</script>');
    expect((await facade.getSchedule(request)).data.message).toBe('当前日期不在教学周历内');
  });

  for (const key of [weekKey, dayKey]) {
    it(`普通读取淘汰历史未公布缓存 ${key}，不阻断 Portal`, async () => {
      await CacheService.set(key, unpublished, 0, 'jw');
      const { facade, calls } = setup();
      expect((await facade.getSchedule(request)).data).toEqual(published);
      expect(calls).toEqual(['jw', 'portal']);
      expect(await CacheService.get(key, { allowExpired: true })).toBeNull();
      expect(await CacheService.get(weekKey, { allowExpired: true })).toBeNull();
    });

    it(`强刷失败也不能以历史未公布缓存降级 ${key}`, async () => {
      await CacheService.set(key, unpublished, 0, 'jw');
      const { jw } = setup();
      expect(await jw.getStaleSchedule(studentId, date, new Error('REQUEST_TIMEOUT'), true)).toBeNull();
      expect(await CacheService.get(key, { allowExpired: true })).toBeNull();
    });
  }

  it('未公布的新响应不覆盖真实旧课表，current 穷尽后仍可 stale 回退', async () => {
    await CacheService.set(weekKey, published, 0, 'jw');
    const { facade, portal, calls } = setup();
    portal.getCurrentSchedule = async () => { calls.push('portal'); throw new Error('REQUEST_TIMEOUT'); };
    const result = await facade.getSchedule({ ...request, forceRefresh: true });
    expect(calls).toEqual(['jw', 'portal']);
    expect(result.data).toEqual(published);
    expect(result._meta).toMatchObject({ source: 'jw', stale: true, fallback: 'stale' });
    expect((await CacheService.get(weekKey))?.data).toEqual(published);
  });

  it('旧空表淘汰遇到并发新写入时直接复用新课表', async () => {
    await CacheService.set(weekKey, unpublished, 0, 'jw');
    const { ports, calls } = setup();
    ports.cache = {
      get: CacheService.get.bind(CacheService), set: CacheService.set.bind(CacheService),
      runSingleflight: CacheService.runSingleflight.bind(CacheService),
      enforcePrefixLimit: CacheService.enforcePrefixLimit.bind(CacheService),
      invalidateIfVersion: async (key, version) => {
        await CacheService.set(key, published, 0, 'jw');
        return CacheService.invalidateIfVersion(key, version);
      },
    };
    const result = await new ScheduleApplicationService(ports).getCurrentSchedule(1, studentId, date);
    expect(result.data).toEqual(published);
    expect(calls).toEqual([]);
    expect((await CacheService.get(weekKey))?.data).toEqual(published);
  });

  it('legacy JW-first 入口继续保留主源未公布短路', async () => {
    const { facade, calls } = setup();
    expect((await facade.getJwFirstSchedule(request)).data).toEqual(unpublished);
    expect(calls).toEqual(['jw']);
  });
});
