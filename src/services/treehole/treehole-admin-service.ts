/**
 * [INPUT]: 依赖 modules/treehole/composition 的 canonical TreeholeAdminService
 * [OUTPUT]: 再导出旧 TreeholeAdminService 类名与路径
 * [POS]: services/treehole 的管理侧兼容 Facade，保持真实作者管理出口稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { TreeholeAdminService } from '../../modules/treehole/composition';
