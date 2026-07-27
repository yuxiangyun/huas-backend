/**
 * [INPUT]: 直接依赖 campus-integrations 内 JW 与 Portal 的 canonical 解析器
 * [OUTPUT]: 对外统一再导出 ScheduleParser、GradeParser、ClassroomFreeParser、ECardParser、UserParser、PortalScheduleParser 及空教室类型
 * [POS]: parsers 的聚合兼容 Facade，旧调用方由此单向进入 Campus Integrations
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { ScheduleParser } from '../modules/campus-integrations/jw/parsers/schedule-parser';
export { GradeParser } from '../modules/campus-integrations/jw/parsers/grade-parser';
export { ClassroomFreeParser } from '../modules/campus-integrations/jw/parsers/classroom-free-parser';
export type { ClassroomBuilding, FreeClassroom } from '../modules/campus-integrations/jw/parsers/classroom-free-parser';
export { ECardParser } from '../modules/campus-integrations/portal/parsers/ecard-parser';
export { UserParser } from '../modules/campus-integrations/portal/parsers/user-parser';
export { PortalScheduleParser } from '../modules/campus-integrations/portal/parsers/portal-schedule-parser';
