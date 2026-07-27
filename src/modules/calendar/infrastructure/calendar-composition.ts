/**
 * [INPUT]: 依赖 config.calendar、Calendar application 与 HMAC/SQLite/Academic 生产适配器
 * [OUTPUT]: 对外提供 createCalendarApplication 纯装配函数与 defaultCalendarApplication 生产实例
 * [POS]: calendar/infrastructure 的 composition root，唯一负责把外部实现注入应用层
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import { CalendarSubscriptionApplicationService } from '../application/calendar-subscription.service';
import type {
  AcademicSchedulePort,
  CalendarClock,
  CalendarRuntimeConfig,
  CalendarScheduleResult,
  CalendarSignaturePort,
  CalendarUserReader,
} from '../application/calendar.ports';
import { AcademicScheduleAdapter } from './academic-schedule.adapter';
import { HmacCalendarSignature } from './hmac-calendar-signature';
import { SqliteCalendarUserReader } from './sqlite-calendar-user.reader';

export function createCalendarApplication<TResult extends CalendarScheduleResult>(options: {
  users: CalendarUserReader;
  signatures: CalendarSignaturePort;
  schedules: AcademicSchedulePort<TResult>;
  clock?: CalendarClock;
  runtimeConfig: CalendarRuntimeConfig;
}): CalendarSubscriptionApplicationService<TResult> {
  return new CalendarSubscriptionApplicationService(
    options.users,
    options.signatures,
    options.schedules,
    options.clock ?? { now: () => new Date() },
    options.runtimeConfig,
  );
}

export const defaultCalendarApplication = createCalendarApplication({
  users: new SqliteCalendarUserReader(),
  signatures: new HmacCalendarSignature(config.calendar.secret),
  schedules: new AcademicScheduleAdapter(),
  runtimeConfig: {
    baseUrl: config.calendar.baseUrl,
    secretConfigured: Boolean(config.calendar.secret),
  },
});
