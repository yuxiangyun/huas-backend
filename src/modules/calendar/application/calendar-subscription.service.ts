/**
 * [INPUT]: 依赖 Calendar 最小 ports、纯 ICS/URL 规则、持久快照与每用户 24 小时回源窗口
 * [OUTPUT]: 对外提供 CalendarSubscriptionApplicationService 及链接/公开订阅结果契约
 * [POS]: calendar/application 的用例编排核心，订阅读取完整学期快照，合流回源并在失败时保留完整旧日历
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import {
  buildCalendarSubscriptionUrl,
  buildSemesterScheduleIcs,
  getCalendarSubscriptionContentHeaders,
  getCurrentWeekRange,
} from '../domain/calendar';
import type { CalendarUser } from '../domain/calendar';
import { AppError, ErrorCode } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';
import type {
  AcademicSchedulePort,
  CalendarClock,
  CalendarRuntimeConfig,
  CalendarScheduleResult,
  CalendarSnapshotStore,
  CalendarSignaturePort,
  CalendarUserReader,
} from './calendar.ports';

const CALENDAR_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;
const CALENDAR_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
    private readonly snapshots: CalendarSnapshotStore,
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

    const ics = await this.snapshots.runSingleflight(user.id, () => this.resolveSemesterSnapshot(user));
    return { kind: 'success', ics, headers: getCalendarSubscriptionContentHeaders() };
  }

  private async resolveSemesterSnapshot(user: CalendarUser): Promise<string> {
    const snapshot = await this.snapshots.get(user.id);
    const now = this.clock.now().getTime();
    if (snapshot && now - snapshot.attemptedAt < CALENDAR_REFRESH_INTERVAL_MS) {
      if (snapshot.ics !== null) return snapshot.ics;
      throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '日历尚无完整课表，请在回源窗口到期后重试', {
        nextRetryAt: new Date(snapshot.attemptedAt + CALENDAR_REFRESH_INTERVAL_MS).toISOString(),
      });
    }

    // 先持久化本轮机会，失败或重启也不能因客户端重复订阅再次回源。
    await this.snapshots.set(user.id, { v: 1, attemptedAt: now, ics: snapshot?.ics ?? null });
    try {
      const semester = await this.schedules.getMobileJwSemesterSchedule(user.id);
      const ics = buildSemesterScheduleIcs({
        studentId: user.studentId, name: user.name, semesterId: semester.semesterId,
        weekStart: semester.startDate, courses: semester.courses, generatedAt: this.clock.now(),
      });
      await this.snapshots.set(user.id, { v: 1, attemptedAt: now, ics });
      return ics;
    } catch (error) {
      Logger.warn('Calendar', '整学期采集失败，保留原快照及本轮回源时间', `userId=${user.id}; hasSnapshot=${snapshot?.ics != null}`);
      if (snapshot?.ics != null) return snapshot.ics;
      throw error;
    }
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
