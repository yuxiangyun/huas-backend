/**
 * [INPUT]: 依赖 credential-recovery 的共享 Portal-only 凭证 reader
 * [OUTPUT]: 兼容再导出 PortalCredentialReader、快照、实现与单例
 * [POS]: mobile-yxt 的旧导入兼容入口，基础凭证读取由 credential-recovery 唯一实现并与 mobile-jw 共享
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
export * from '../credential-recovery/portal-credential-reader';
