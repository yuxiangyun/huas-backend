/**
 * [INPUT]: 依赖 modules/discover/composition 的帖子 application 委托类与 infrastructure 的 DiscoverPostQuery
 * [OUTPUT]: 再导出旧 DiscoverPostService 与 DiscoverPostQuery 标识
 * [POS]: services/discover 的帖子兼容 Facade，业务调用落到 application，仅查询组件旧出口直指 infrastructure
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export {
  DiscoverPostService,
} from '../../modules/discover/composition';
export { DiscoverPostQuery } from '../../modules/discover/infrastructure/sqlite-discover-post-service';
