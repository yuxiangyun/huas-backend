/**
 * [INPUT]: 依赖 modules/treehole/composition 的 canonical TreeholeUserService
 * [OUTPUT]: 再导出旧 TreeholeUserService 类名与路径
 * [POS]: services/treehole 的用户侧兼容 Facade，不承载 SQL、事务或领域规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { TreeholeUserService } from '../../modules/treehole/composition';
