/**
 * [INPUT]: 依赖 modules/discover/application 的 canonical 用户用例门面与领域 DTO
 * [OUTPUT]: 再导出旧 DiscoverUserService、输入输出类型和路径
 * [POS]: services/discover 的用户用例兼容 Facade，不持有数据库或媒体实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { DiscoverUserService } from '../../modules/discover/composition';
export type {
  CreateDiscoverCommentInput,
  CreatePostInput,
  DiscoverCommentListResponse,
  DiscoverCommentResponse,
  DiscoverListResponse,
  DiscoverPostResponse,
  DiscoverSort,
  ListOptions,
} from '../../modules/discover/domain/discover';
