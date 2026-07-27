/**
 * [INPUT]: 依赖 Drizzle schema、运行时 DiscoverPolicy 配置与 domain 的 canonical 规则/DTO
 * [OUTPUT]: 对外提供 SQLite selector/join，并以旧签名适配需要 policy 的领域函数
 * [POS]: modules/discover/infrastructure 的 SQLite 行映射边界，不保存业务规则副本
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq } from 'drizzle-orm';
import { config } from '../../../config';
import { schema } from '../../../db';
import {
  clampCommentPageSize as clampDomainCommentPageSize,
  getDiscoverMeta as getDomainDiscoverMeta,
  normalizeCommentContent as normalizeDomainCommentContent,
  normalizeContent as normalizeDomainContent,
  normalizePriceText as normalizeDomainPriceText,
  normalizeStoreName as normalizeDomainStoreName,
  normalizeTags as normalizeDomainTags,
  normalizeTitle as normalizeDomainTitle,
} from '../domain/discover';

export type {
  CreateDiscoverCommentInput,
  CreatePostInput,
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
  clampPage,
  clampPageSize,
  clampRecommendedCandidateLimit,
  normalizeCategory,
  roundRating,
  toCommentResponse,
  toPostResponse,
} from '../domain/discover';

const discoverPolicy = {
  maxImagesPerPost: config.discover.maxImagesPerPost,
  maxTagsPerPost: config.discover.maxTagsPerPost,
  maxTitleLength: config.discover.maxTitleLength,
  maxTagLength: config.discover.maxTagLength,
  maxStoreNameLength: config.discover.maxStoreNameLength,
  maxPriceTextLength: config.discover.maxPriceTextLength,
  maxContentLength: config.discover.maxContentLength,
  maxCommentLength: config.discover.maxCommentLength,
  defaultCommentPageSize: config.discover.defaultCommentPageSize,
  maxCommentPageSize: config.discover.maxCommentPageSize,
};

export function getDiscoverMeta() {
  return getDomainDiscoverMeta(discoverPolicy);
}

export function clampCommentPageSize(pageSize: number | undefined) {
  return clampDomainCommentPageSize(pageSize, discoverPolicy);
}

export function normalizeTitle(value: string | undefined) {
  return normalizeDomainTitle(value, discoverPolicy);
}

export function normalizeStoreName(value: string | undefined) {
  return normalizeDomainStoreName(value, discoverPolicy);
}

export function normalizePriceText(value: string | undefined) {
  return normalizeDomainPriceText(value, discoverPolicy);
}

export function normalizeContent(value: string | undefined) {
  return normalizeDomainContent(value, discoverPolicy);
}

export function normalizeCommentContent(value: string) {
  return normalizeDomainCommentContent(value, discoverPolicy);
}

export function normalizeTags(tags: string[]) {
  return normalizeDomainTags(tags, discoverPolicy);
}

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
    ratingCount: schema.discoverPosts.ratingCount,
    ratingSum: schema.discoverPosts.ratingSum,
    ratingAvg: schema.discoverPosts.ratingAvg,
    createdAt: schema.discoverPosts.createdAt,
    updatedAt: schema.discoverPosts.updatedAt,
    publishedAt: schema.discoverPosts.publishedAt,
    deletedAt: schema.discoverPosts.deletedAt,
    authorClassName: schema.users.className,
  };
}

export function commentSelect() {
  return {
    id: schema.discoverComments.id,
    postId: schema.discoverComments.postId,
    userId: schema.discoverComments.userId,
    parentCommentId: schema.discoverComments.parentCommentId,
    content: schema.discoverComments.content,
    avatarUrl: schema.users.treeholeAvatarUrl,
    authorClassName: schema.users.className,
    createdAt: schema.discoverComments.createdAt,
    updatedAt: schema.discoverComments.updatedAt,
    deletedAt: schema.discoverComments.deletedAt,
  };
}

export function recommendedRatingJoin(userId: number) {
  return and(
    eq(schema.discoverPostRatings.postId, schema.discoverPosts.id),
    eq(schema.discoverPostRatings.userId, userId),
  );
}
