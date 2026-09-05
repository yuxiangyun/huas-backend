/**
 * [INPUT]: 依赖 Calendar 最小 ports、纯 ICS/URL/本周规则与 15 分钟快照窗口
 * [OUTPUT]: 对外提供 CalendarSubscriptionApplicationService 及链接/公开订阅结果契约
 * [POS]: calendar/application 的用例编排核心，统一签名、用户、移动教务单源课表刷新与空 ICS 退化
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import {
  buildCalendarSubscriptionUrl,
  buildEmptyWeeklyScheduleIcs,
  buildWeeklyScheduleIcs,
  getCalendarSubscriptionContentHeaders,
  getCurrentWeekRange,
} from '../domain/calendar';
import type { CalendarUser } from '../domain/calendar';
import type {
  AcademicSchedulePort,
  CalendarClock,
  CalendarRuntimeConfig,
  CalendarScheduleResult,
  CalendarSignaturePort,
  CalendarUserReader,
} from './calendar.ports';

const CALENDAR_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;

export type CalendarLinkResult =
  | { kind: 'missing-base-url' }
  | { kind: 'missing-secret' }
  | { kind: 'success'; url: string; studentId: string; sig: string };

export type CalendarSubscriptionResult =
  | { kind: 'missing-secret' }
  | { kind: 'invalid-signature' }
  | { kind: 'user-not-found' }
  | { kind: 'success'; ics: string; headers: Record<string, string> };

export class CalendarSubscriptionApplicationService<TResult extends CalendarScheduleResult = CalendarScheduleResult> {
  constructor(
    private readonly users: CalendarUserReader,
    private readonly signatures: CalendarSignaturePort,
    private readonly schedules: AcademicSchedulePort<TResult>,
    private readonly clock: CalendarClock,
    private readonly runtimeConfig: CalendarRuntimeConfig,
  ) {}

  createSubscriptionLink(studentId: string): CalendarLinkResult {
    const baseUrl = this.runtimeConfig.baseUrl.replace(/\/+$/, '');
    if (!baseUrl) return { kind: 'missing-base-url' };
    if (!this.runtimeConfig.secretConfigured) return { kind: 'missing-secret' };

    const sig = this.signatures.generate(studentId);
    return {
      kind: 'success',
      url: buildCalendarSubscriptionUrl(baseUrl, studentId, sig),
      studentId,
      sig,
    };
  }

  async resolveSubscription(studentId: string, signature: string): Promise<CalendarSubscriptionResult> {
    if (!this.runtimeConfig.secretConfigured) return { kind: 'missing-secret' };
    if (!this.signatures.verify(studentId, signature)) return { kind: 'invalid-signature' };

    const user = await this.users.findByStudentId(studentId);
    if (!user) return { kind: 'user-not-found' };

    let ics: string;
    try {
      const { range, result } = await this.getCurrentWeekSchedule(user);
      ics = buildWeeklyScheduleIcs({
        studentId: user.studentId,
        name: user.name,
        weekStart: range.startDate,
        courses: Array.isArray(result.data?.courses) ? result.data.courses : [],
      });
    } catch (error: any) {
      if (error?.message !== 'SCHEDULE_NOT_AVAILABLE') throw error;
      ics = buildEmptyWeeklyScheduleIcs({ studentId: user.studentId, name: user.name });
    }

    return { kind: 'success', ics, headers: getCalendarSubscriptionContentHeaders() };
  }

  resolveUser(studentId: string): Promise<CalendarUser | null> {
    return this.users.findByStudentId(studentId);
  }

  async getCurrentWeekSchedule(user: CalendarUser) {
    const { startDate, endDate } = getCurrentWeekRange(this.clock.now());
    const readSchedule = (forceRefresh: boolean) => this.schedules.getMobileJwSchedule({
      userId: user.id,
      studentId: user.studentId,
      date: startDate,
      forceRefresh,
      name: user.name,
    });

    let result = await readSchedule(false);
    const updatedAt = result._meta.updated_at ? Date.parse(result._meta.updated_at) : NaN;
    const staleSnapshot = result._meta.cached
      && (!Number.isFinite(updatedAt) || this.clock.now().getTime() - updatedAt >= CALENDAR_SNAPSHOT_MAX_AGE_MS);
    if (staleSnapshot) result = await readSchedule(true);

    return { range: { startDate, endDate }, result };
  }
}
