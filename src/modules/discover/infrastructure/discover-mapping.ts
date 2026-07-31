/**
 * [INPUT]: 依赖 Drizzle schema 与 Discover canonical 行类型，不读取 Community 或 Identity 表
 * [OUTPUT]: 对外提供 DiscoverDatabase/DiscoverTransaction 类型、帖子/评论事实 selector 与领域类型再导出
 * [POS]: modules/discover/infrastructure 的 SQLite 行映射边界，只描述本模块拥有的事实列
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { schema } from '../../../db';
import type { getDb } from '../../../db';

export type DiscoverDatabase = ReturnType<typeof getDb>;
export type DiscoverTransaction = Parameters<Parameters<DiscoverDatabase['transaction']>[0]>[0];

export type {
  DiscoverCommentListResponse,
  DiscoverCommentResponse,
  DiscoverCommentRow,
  DiscoverListResponse,
  DiscoverPostResponse,
  DiscoverRow,
  DiscoverSort,
  ListOptions,
} from '../domain/discover';
export {
  clampCommentPageSize,
  clampPage,
  clampPageSize,
  clampRecommendedCandidateLimit,
  normalizeCategory,
  safeParseJsonArray,
  toCommentResponse,
  toPostResponse,
} from '../domain/discover';

export function postSelect() {
  return {
    id: schema.discoverPosts.id,
    userId: schema.discoverPosts.userId,
    title: schema.discoverPosts.title,
    storeName: schema.discoverPosts.storeName,
    priceText: schema.discoverPosts.priceText,
    content: schema.discoverPosts.content,
    category: schema.discoverPosts.category,
    storageKey: schema.discoverPosts.storageKey,
    imagesJson: schema.discoverPosts.imagesJson,
    tagsJson: schema.discoverPosts.tagsJson,
    coverUrl: schema.discoverPosts.coverUrl,
    imageCount: schema.discoverPosts.imageCount,
    commentCount: schema.discoverPosts.commentCount,
    likeCount: schema.discoverPosts.likeCount,
    createdAt: schema.discoverPosts.createdAt,
    updatedAt: schema.discoverPosts.updatedAt,
    publishedAt: schema.discoverPosts.publishedAt,
    deletedAt: schema.discoverPosts.deletedAt,
  };
}

export function commentSelect() {
  return {
    id: schema.discoverComments.id,
    postId: schema.discoverComments.postId,
    userId: schema.discoverComments.userId,
    parentCommentId: schema.discoverComments.parentCommentId,
    content: schema.discoverComments.content,
    createdAt: schema.discoverComments.createdAt,
    updatedAt: schema.discoverComments.updatedAt,
    deletedAt: schema.discoverComments.deletedAt,
  };
}
