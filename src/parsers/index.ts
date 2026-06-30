/**
 * [INPUT]: 依赖 parsers/academic 与 parsers/portal 的具体解析器
 * [OUTPUT]: 对外统一再导出 ScheduleParser、GradeParser、ClassroomFreeParser、ECardParser、UserParser、PortalScheduleParser 及空教室类型
 * [POS]: parsers 的兼容出口，维持旧调用方统一导入路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { ScheduleParser } from './academic/schedule-parser';
export { GradeParser } from './academic/grade-parser';
export { ClassroomFreeParser } from './academic/classroom-free-parser';
export type { ClassroomBuilding, FreeClassroom } from './academic/classroom-free-parser';
export { ECardParser } from './portal/ecard-parser';
export { UserParser } from './portal/user-parser';
export { PortalScheduleParser } from './portal/portal-schedule-parser';
