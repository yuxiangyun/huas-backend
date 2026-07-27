/**
 * [INPUT]: 依赖 modules/academic/application 的 canonical JW 课表用例
 * [OUTPUT]: 兼容再导出 ScheduleService，保持旧导入路径与运行时类引用
 * [POS]: services/academic 的只读迁移 Facade，旧调用单向指向 Academic application
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { ScheduleService } from '../../modules/academic/schedule';
