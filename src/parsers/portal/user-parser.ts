/**
 * [INPUT]: 依赖 campus-integrations/portal/parsers 的 canonical 用户资料解析器
 * [OUTPUT]: 兼容再导出 UserParser
 * [POS]: parsers/portal 的只读迁移 Facade，保持旧 Portal 用户资料解析路径稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { UserParser } from '../../modules/campus-integrations/portal/parsers/user-parser';
