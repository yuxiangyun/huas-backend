/**
 * [INPUT]: 依赖 campus-integrations/portal/parsers 的 canonical 课表解析器
 * [OUTPUT]: 兼容再导出 PortalScheduleParser
 * [POS]: parsers/portal 的只读迁移 Facade，维持未迁 PortalScheduleService 的调用稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { PortalScheduleParser } from '../../modules/campus-integrations/portal/parsers/portal-schedule-parser';
