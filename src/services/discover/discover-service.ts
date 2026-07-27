/**
 * [INPUT]: 依赖 modules/discover/application 的 canonical DiscoverService
 * [OUTPUT]: 再导出旧 DiscoverService 类名与路径
 * [POS]: services/discover 的总门面兼容 Facade，只允许旧路径指向新模块
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { DiscoverService } from '../../modules/discover/composition';
