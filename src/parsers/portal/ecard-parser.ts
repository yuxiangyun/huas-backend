/**
 * [INPUT]: 依赖 campus-integrations/portal/parsers 的 canonical 一卡通解析器
 * [OUTPUT]: 兼容再导出 ECardParser
 * [POS]: parsers/portal 的只读迁移 Facade，保持旧 Portal 解析路径稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { ECardParser } from '../../modules/campus-integrations/portal/parsers/ecard-parser';
