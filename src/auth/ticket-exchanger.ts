/**
 * [INPUT]: 依赖 campus-integrations/cas 的 canonical TicketExchanger
 * [OUTPUT]: 兼容再导出 TicketExchanger 类
 * [POS]: auth 的只读迁移 Facade，保持旧学校换票路径稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { TicketExchanger } from '../modules/campus-integrations/cas/ticket-exchanger';
