/**
 * [INPUT]: 依赖 modules/treehole/composition 的 canonical TreeholeService
 * [OUTPUT]: 再导出旧 TreeholeService 类名与路径
 * [POS]: services/treehole 的总门面兼容 Facade，只允许旧路径指向新模块
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { TreeholeService } from '../../modules/treehole/composition';
