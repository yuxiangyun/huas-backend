/**
 * [INPUT]: 依赖 campus-integrations/credential-recovery 的 canonical 凭证管理器
 * [OUTPUT]: 兼容再导出 CredentialManager 与 CredentialSystem
 * [POS]: auth 的只读迁移 Facade，保持旧学校凭证生命周期入口稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { CredentialManager } from '../modules/campus-integrations/credential-recovery/credential-manager';
export type { CredentialSystem } from '../modules/campus-integrations/credential-recovery/credential-manager';
