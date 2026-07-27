/**
 * [INPUT]: 依赖 modules/academic/application 的 canonical Portal 单源课表用例
 * [OUTPUT]: 兼容再导出 PortalScheduleService，保持旧导入路径与运行时类引用
 * [POS]: services/portal 的只读迁移 Facade，Portal 课表事实归属 Academic
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { PortalScheduleService } from '../../modules/academic/schedule';
