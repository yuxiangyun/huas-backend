/**
 * [INPUT]: 依赖 Academic canonical ScheduleFacade 与 Calendar AcademicSchedulePort
 * [OUTPUT]: 对外提供 AcademicScheduleAdapter，委托移动教务固定单源周课表查询
 * [POS]: calendar/infrastructure 的 Academic 防腐适配器，保持 Calendar → Academic 单向依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ScheduleFacade } from '../../academic/schedule';
import type { AcademicSchedulePort } from '../application/calendar.ports';

export class AcademicScheduleAdapter implements AcademicSchedulePort {
  getMobileJwSchedule(options: Parameters<AcademicSchedulePort['getMobileJwSchedule']>[0]) {
    return ScheduleFacade.getMobileJwSchedule(options);
  }
}
