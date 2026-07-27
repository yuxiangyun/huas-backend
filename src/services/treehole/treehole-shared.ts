/**
 * [INPUT]: 依赖 modules/treehole/legacy-shared 的完整兼容出口
 * [OUTPUT]: 再导出旧 Treehole 共享类型、无 policy 参数规则与 SQLite helper
 * [POS]: services/treehole 的共享内核兼容 Facade，保持一个迁移版本的全部旧导出
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export * from '../../modules/treehole/legacy-shared';
