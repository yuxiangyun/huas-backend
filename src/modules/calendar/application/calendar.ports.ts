/**
 * [INPUT]: 依赖 CalendarUser、ICourse 与 Academic 缓存观测字段的类型契约
 * [OUTPUT]: 对外提供用户查询、签名、Academic 课表与时钟的最小 ports
 * [POS]: calendar/application 的依赖边界，使用例只看到 Calendar 真正需要的外部能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ICourse } from '../../../types';
import type { CalendarUser } from '../domain/calendar';

export interface CalendarUserReader {
  findByStudentId(studentId: string): Promise<CalendarUser | null>;
}

export interface CalendarSignaturePort {
  generate(studentId: string): string;
  verify(studentId: string, signature: string): boolean;
}

export type CalendarScheduleResult = {
  data?: { courses?: ICourse[] };
  _meta: { cached: boolean; updated_at?: string };
};

export interface AcademicSchedulePort<TResult extends CalendarScheduleResult = CalendarScheduleResult> {
  getPortalFirstSchedule(options: {
    userId: number;
    studentId: string;
    startDate: string;
    endDate: string;
    forceRefresh: boolean;
    name?: string;
  }): Promise<TResult>;
}

export interface CalendarClock {
  now(): Date;
}

export type CalendarRuntimeConfig = {
  baseUrl: string;
  secretConfigured: boolean;
};
