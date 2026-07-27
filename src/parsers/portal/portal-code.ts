/**
 * [INPUT]: 依赖 campus-integrations/portal/parsers 的 canonical code 语义
 * [OUTPUT]: 兼容再导出 Portal code 判断函数
 * [POS]: parsers/portal 的只读迁移 Facade，保持数字/字符串 code 旧入口稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { isPortalSessionExpiredCode, isPortalSuccessCode } from '../../modules/campus-integrations/portal/parsers/portal-code';
