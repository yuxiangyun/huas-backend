/**
 * [INPUT]: 依赖 modules/operations/infrastructure 的 canonical UGC 运行策略
 * [OUTPUT]: 继续导出 ugcComplianceState、UgcComplianceStatus 旧值/类型与路径
 * [POS]: runtime 的单向兼容 Facade；normal/compliance 文件态已迁入 Operations
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { ugcComplianceState } from '../modules/operations/infrastructure/ugc-compliance-state';
export type { UgcComplianceStatus } from '../modules/operations/infrastructure/ugc-compliance-state';
