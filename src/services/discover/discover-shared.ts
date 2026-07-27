/**
 * [INPUT]: 依赖 modules/discover 的 canonical 领域类型/规则与 infrastructure 行映射器
 * [OUTPUT]: 再导出旧 discover-shared 全部类型、校验、分页、selector 与映射函数
 * [POS]: services/discover 的共享出口兼容 Facade，避免旧消费者感知职责拆分
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export * from '../../modules/discover/infrastructure/discover-mapping';
