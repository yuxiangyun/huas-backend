/**
 * [INPUT]: 依赖 modules/discover/infrastructure 的 canonical 媒体 adapter
 * [OUTPUT]: 再导出 DiscoverMediaService 与长期媒体缓存头常量
 * [POS]: services/discover 的媒体兼容 Facade，供未改动的 src/index.ts 继续装配静态读取
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export {
  DISCOVER_MEDIA_CACHE_CONTROL,
  DiscoverMediaService,
} from '../../modules/discover/infrastructure/discover-media-service';
