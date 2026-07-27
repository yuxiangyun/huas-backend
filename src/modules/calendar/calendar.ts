/**
 * [INPUT]: 依赖 Calendar domain 纯规则与 infrastructure 默认应用装配
 * [OUTPUT]: 对外提供日历订阅规则、用户解析与当前周课表的 canonical 公开 API
 * [POS]: calendar 纵向切片的 composition facade，为旧 services 路径提供稳定单向兼容目标
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export {
  buildCalendarSubscriptionUrl,
  buildEmptyWeeklyScheduleIcs,
  buildWeeklyScheduleIcs,
  getCalendarSubscriptionContentHeaders,
  getCurrentWeekRange,
  getSectionTimeMap,
} from './domain/calendar';
export type { CalendarUser } from './domain/calendar';

import type { CalendarUser } from './domain/calendar';
import { defaultCalendarApplication } from './infrastructure/calendar-composition';

export function resolveCalendarSubscriptionUser(studentId: string) {
  return defaultCalendarApplication.resolveUser(studentId);
}

export function getCurrentWeekSchedule(user: CalendarUser) {
  return defaultCalendarApplication.getCurrentWeekSchedule(user);
}
