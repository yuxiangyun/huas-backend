/**
 * [INPUT]: 依赖隔离 SQLite、可控时钟、移动教务真实周结构与 Calendar/Academic 应用
 * [OUTPUT]: 验证整学期完整性、订阅专属 24 小时窗口、并发合流、重建实例与失败保留
 * [POS]: tests 的学期订阅契约，网络使用替身，持久化使用真实 Cache adapter
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { getDb, schema } from '../src/db';
import { MobileJwSemesterApplicationService } from '../src/modules/academic/application/mobile-jw-semester-service';
import { CalendarSnapshotCacheStore } from '../src/modules/calendar/infrastructure/calendar-snapshot.store';
import { createCalendarApplication } from '../src/modules/calendar/infrastructure/calendar-composition';
import { CacheService } from '../src/modules/cache/cache-service';
import type { AcademicSchedulePort } from '../src/modules/calendar/application/calendar.ports';

const DAY_MS = 86_400_000;
const userId = 9821;

beforeEach(async () => { await getDb().delete(schema.cache); });

function fixture(week: number, empty = false) {
  const course = { courseName: `第${week}周课程`, teacherName: '教师', location: '教室', classTime: '10102', classWeek: '1-3' };
  const monday = Date.parse('2026-09-07T00:00:00Z') + (week - 1) * 7 * DAY_MS;
  return [{
    // 模拟指定周响应仍返回当前周的真实上游行为。
    week: '2',
    date: Array.from({ length: 7 }, (_, i) => ({ mxrq: new Date(monday + i * DAY_MS).toISOString().slice(0, 10) })),
    nodesLst: [{ nodeNumber: '01' }, { nodeNumber: '02' }],
    courses: empty ? [] : [course], item: [empty ? [] : [[course]], [], [], [], [], [], []],
    topInfo: [{ semesterId: '2026-2027-1', maxWeek: '3' }],
  }];
}

function harness() {
  let now = Date.parse('2026-09-14T00:00:00Z');
  let calls = 0;
  let fail = false;
  let failWeek = 0;
  const requestedWeeks: number[] = [];
  const academic = new MobileJwSemesterApplicationService({ current: async (_id, input) => {
    calls += 1;
    const week = input?.week ?? 2;
    requestedWeeks.push(week);
    if (fail || week === failWeek) throw new Error('UPSTREAM_FAILED');
    return { data: fixture(week), message: null };
  } });
  const schedules: AcademicSchedulePort = {
    getMobileJwSemesterSchedule: (id) => academic.getSemesterSchedule(id),
    getMobileJwSchedule: async () => ({ data: { courses: [] }, _meta: { cached: false } }),
  };
  const snapshots = new CalendarSnapshotCacheStore();
  const create = () => createCalendarApplication({
    users: { findByStudentId: async (studentId) => studentId === 'missing' ? null : { id: studentId === 'other' ? userId + 1 : userId, studentId } },
    signatures: { generate: () => 'valid', verify: (_id, sig) => sig === 'valid' },
    schedules, snapshots: new CalendarSnapshotCacheStore(),
    clock: { now: () => new Date(now) },
    runtimeConfig: { baseUrl: 'https://calendar.example.test', secretConfigured: true },
  });
  const service = create();
  return {
    service, create, snapshots, schedules, requestedWeeks,
    calls: () => calls, advance: (ms: number) => { now += ms; },
    fail: () => { fail = true; }, failWeek: (week: number) => { failWeek = week; },
    read: () => service.resolveSubscription('student', 'valid'),
  };
}

describe('整学期订阅采集', () => {
  it('一次订阅包含当前学期首周、中间周、末周，当前周锚点只请求一次', async () => {
    const h = harness();
    const result = await h.read();
    expect(h.requestedWeeks).toEqual([2, 1, 3]);
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') throw new Error('expected ICS');
    for (const date of ['20260907', '20260914', '20260921']) expect(result.ics).toContain(`DTSTART;TZID=Asia/Shanghai:${date}T080000`);
    expect(result.ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(result.ics).toContain('2026-2027-1 学期课表');
    expect(result.ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:P1D');
  });

  it('拒绝缺学期元信息、错误日期、跨学期与周数变化，合法空周仍可聚合', async () => {
    for (const corrupt of ['missing', 'date', 'semester', 'maxWeek']) {
      const academic = new MobileJwSemesterApplicationService({ current: async (_id, input) => {
        const data = fixture(input?.week ?? 2);
        if (corrupt === 'missing') data[0].topInfo = [];
        if (input?.week) {
          if (corrupt === 'date') return { data: fixture(2), message: null };
          if (corrupt === 'semester') data[0].topInfo[0].semesterId = '2025-2026-1';
          if (corrupt === 'maxWeek') data[0].topInfo[0].maxWeek = '4';
        }
        return { data, message: null };
      } });
      await expect(academic.getSemesterSchedule(userId)).rejects.toMatchObject({ kind: 'protocol' });
    }
    const academic = new MobileJwSemesterApplicationService({ current: async (_id, input) => ({
      data: fixture(input?.week ?? 2, input?.week === 1), message: null,
    }) });
    expect((await academic.getSemesterSchedule(userId)).courses).toHaveLength(2);
  });
});

describe('日历独立 24 小时窗口', () => {
  it('生成链接、查询用户、旧周查询和普通课表缓存写入均不占用日历机会', async () => {
    const h = harness();
    h.service.createSubscriptionLink('student');
    await h.service.resolveUser('student');
    await h.service.getCurrentWeekSchedule({ id: userId, studentId: 'student' });
    await CacheService.set('mobile-jw-schedule:student:2026-09-14', { ordinary: true }, 0);
    expect(await h.snapshots.get(userId)).toBeNull();
    expect(h.calls()).toBe(0);
    await h.read();
    expect(h.calls()).toBe(3);
    const snapshot = await h.snapshots.get(userId);
    h.advance(DAY_MS - 1);
    h.service.createSubscriptionLink('student');
    await h.service.getCurrentWeekSchedule({ id: userId, studentId: 'student' });
    await CacheService.set('mobile-jw-schedule:student:2026-09-14', { refreshed: true }, 0);
    await h.read();
    expect(await h.snapshots.get(userId)).toEqual(snapshot);
    expect(h.calls()).toBe(3);
    h.advance(1);
    await h.read();
    expect(h.calls()).toBe(6);
  });

  it('并发订阅共用一轮；持久快照跨应用实例复用且日历客户端收到相同字节', async () => {
    const h = harness();
    const results = await Promise.all(Array.from({ length: 10 }, () => h.read()));
    expect(h.calls()).toBe(3);
    for (const result of results) expect(result).toEqual(results[0]);
    h.advance(DAY_MS - 1);
    expect(await h.create().resolveSubscription('student', 'valid')).toEqual(results[0]);
    expect(h.calls()).toBe(3);
  });

  it('不同用户分别享有窗口，签名错误和用户不存在不记录机会', async () => {
    const h = harness();
    expect((await h.service.resolveSubscription('student', 'invalid')).kind).toBe('invalid-signature');
    expect((await h.service.resolveSubscription('missing', 'valid')).kind).toBe('user-not-found');
    expect(await h.snapshots.get(userId)).toBeNull();
    await h.read();
    await h.service.resolveSubscription('other', 'valid');
    expect(h.calls()).toBe(6);
  });

  it('中途失败不保存残缺学期；窗口内继续提供上次完整日历且不延长窗口', async () => {
    const h = harness();
    const original = await h.read();
    h.advance(DAY_MS);
    h.failWeek(3);
    expect(await h.read()).toEqual(original);
    expect(h.calls()).toBe(6);
    const failed = await h.snapshots.get(userId);
    h.advance(DAY_MS - 1);
    expect(await h.create().resolveSubscription('student', 'valid')).toEqual(original);
    expect(await h.snapshots.get(userId)).toEqual(failed);
    expect(h.calls()).toBe(6);
    h.advance(1);
    await h.read();
    expect(h.calls()).toBe(9);
  });

  it('首次失败保留机会，后续订阅不再回源且不伪造空日历', async () => {
    const h = harness();
    h.fail();
    await expect(h.read()).rejects.toThrow('UPSTREAM_FAILED');
    expect(h.calls()).toBe(1);
    expect((await h.snapshots.get(userId))?.ics).toBeNull();
    await expect(h.create().resolveSubscription('student', 'valid')).rejects.toMatchObject({ code: 3005 });
    expect(h.calls()).toBe(1);
    h.advance(DAY_MS);
    await expect(h.read()).rejects.toThrow('UPSTREAM_FAILED');
    expect(h.calls()).toBe(2);
  });
});
