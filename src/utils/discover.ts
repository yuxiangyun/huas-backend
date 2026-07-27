/**
 * [INPUT]: 依赖 modules/discover/domain 的 canonical 常量、类型与纯函数
 * [OUTPUT]: 再导出 Discover 分类、标签、作者标签、数组解析与媒体 DTO 旧工具路径
 * [POS]: utils 的 Discover 兼容 Facade，通用调用方可继续使用旧路径而不复制领域规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export {
  DISCOVER_CATEGORIES,
  DISCOVER_COMMON_TAGS,
  buildDiscoverAuthorLabel,
  isDiscoverCategory,
  parseStringArray,
  safeParseJsonArray,
} from '../modules/discover/domain/discover';
export type {
  DiscoverCategory,
  DiscoverStoredImage,
} from '../modules/discover/domain/discover';
