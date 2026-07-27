/**
 * [INPUT]: 依赖 modules/discover/composition 的 canonical 管理删除 application 委托类
 * [OUTPUT]: 再导出旧 DiscoverAdminService 类名与路径
 * [POS]: services/discover 的管理删除兼容 Facade，不直接理解 SQLite 或媒体实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { DiscoverAdminService } from '../../modules/discover/composition';
