/**
 * [INPUT]: 依赖 campus-integrations/jw/parsers 的 canonical 课表解析器
 * [OUTPUT]: 兼容再导出 ScheduleParser
 * [POS]: parsers/academic 的只读迁移 Facade，保持旧 JW 课表解析路径稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { ScheduleParser } from '../../modules/campus-integrations/jw/parsers/schedule-parser';
