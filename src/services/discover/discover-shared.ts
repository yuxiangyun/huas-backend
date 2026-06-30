/**
 * [INPUT]: 依赖 Drizzle schema/config、discover 工具、time 工具和 AppError 错误模型
 * [OUTPUT]: 对外提供 Discover 领域类型、分页/校验/选择器/响应组装函数
 * [POS]: services/discover 的共享内核，被用户服务与门面服务消费，隔离无状态领域规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq } from 'drizzle-orm';
import { config } from '../../config';
import { schema } from '../../db';
import {
  buildDiscoverAuthorLabel,
  DISCOVER_CATEGORIES,
  DISCOVER_COMMON_TAGS,
  isDiscoverCategory,
  safeParseJsonArray,
  type DiscoverStoredImage,
} from '../../utils/discover';
import { AppError, ErrorCode } from '../../utils/errors';
import { beijingIsoString } from '../../utils/time';

export type DiscoverSort = 'latest' | 'score' | 'recommended';

export interface ListOptions {
  userId: number;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface DiscoverRow {
  id: number;
  userId: number;
  title: string | null;
  storeName: string | null;
  priceText: string | null;
  content: string | null;
  category: string;
  imagesJson: string;
  tagsJson: string;
  coverUrl: string;
  imageCount: number;
  commentCount: number;
  ratingCount: number;
  ratingSum: number;
  ratingAvg: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date;
  deletedAt: Date | null;
  storageKey: string;
  authorClassName: string | null;
}

export interface DiscoverCommentRow {
  id: number;
  postId: number;
  userId: number;
  parentCommentId: number | null;
  content: string;
  avatarUrl: string | null;
  authorClassName: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreatePostInput {
  userId: number;
  title?: string;
  storeName?: string;
  priceText?: string;
  content?: string;
  category: string;
  tags: string[];
  images: File[];
}

export interface CreateDiscoverCommentInput {
  userId: number;
  postId: number;
  content: string;
  parentCommentId?: number | null;
}

export interface DiscoverPostResponse {
  id: number;
  title: string;
  storeName: string;
  priceText: string;
  content: string;
  category: string;
  tags: string[];
  images: DiscoverStoredImage[];
  coverUrl: string;
  imageCount: number;
  commentCount: number;
  rating: {
    average: number;
    count: number;
    total: number;
    userScore: number | null;
  };
  author: {
    id: number;
    label: string;
  };
  isMine: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverCommentResponse {
  id: number;
  postId: number;
  parentCommentId: number | null;
  content: string;
  avatarUrl: string | null;
  author: {
    id: number;
    label: string;
  };
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverListResponse {
  items: DiscoverPostResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface DiscoverCommentListResponse {
  items: DiscoverCommentResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const RECOMMENDED_CANDIDATE_BASE_LIMIT = 120;
const RECOMMENDED_CANDIDATE_MULTIPLIER = 8;
const RECOMMENDED_CANDIDATE_MAX_LIMIT = 400;

export function getDiscoverMeta() {
  return {
    categories: [...DISCOVER_CATEGORIES],
    commonTags: [...DISCOVER_COMMON_TAGS],
    limits: {
      maxImagesPerPost: config.discover.maxImagesPerPost,
      maxTagsPerPost: config.discover.maxTagsPerPost,
      maxTitleLength: config.discover.maxTitleLength,
      maxTagLength: config.discover.maxTagLength,
      maxStoreNameLength: config.discover.maxStoreNameLength,
      maxPriceTextLength: config.discover.maxPriceTextLength,
      maxContentLength: config.discover.maxContentLength,
      maxCommentLength: config.discover.maxCommentLength,
    },
    pagination: {
      defaultCommentPageSize: config.discover.defaultCommentPageSize,
      maxCommentPageSize: config.discover.maxCommentPageSize,
    },
  };
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

export function clampPageSize(pageSize: number | undefined) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
}

export function clampPage(page: number | undefined) {
  if (!page || !Number.isFinite(page) || page <= 0) return 1;
  return Math.floor(page);
}

export function clampCommentPageSize(pageSize: number | undefined) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) {
    return config.discover.defaultCommentPageSize;
  }
  return Math.min(Math.floor(pageSize), config.discover.maxCommentPageSize);
}

export function clampRecommendedCandidateLimit(page: number, pageSize: number) {
  const requested = page * pageSize * RECOMMENDED_CANDIDATE_MULTIPLIER;
  return Math.min(RECOMMENDED_CANDIDATE_MAX_LIMIT, Math.max(RECOMMENDED_CANDIDATE_BASE_LIMIT, requested));
}

export function recommendedRatingJoin(userId: number) {
  return and(
    eq(schema.discoverPostRatings.postId, schema.discoverPosts.id),
    eq(schema.discoverPostRatings.userId, userId),
  );
}

export function normalizeTitle(value: string | undefined) {
  const title = value?.trim() || '';
  if (!title) {
    throw new AppError(ErrorCode.PARAM_ERROR, '请写清楚这顿饭叫什么');
  }
  if (title.length > config.discover.maxTitleLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `标题不能超过 ${config.discover.maxTitleLength} 个字`);
  }
  return title;
}

export function normalizeStoreName(value: string | undefined) {
  const storeName = value?.trim() || '';
  if (!storeName) return null;
  if (storeName.length > config.discover.maxStoreNameLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `档口或店名不能超过 ${config.discover.maxStoreNameLength} 个字`);
  }
  return storeName;
}

export function normalizePriceText(value: string | undefined) {
  const priceText = value?.trim() || '';
  if (!priceText) return null;
  if (priceText.length > config.discover.maxPriceTextLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `价格信息不能超过 ${config.discover.maxPriceTextLength} 个字`);
  }
  return priceText;
}

export function normalizeContent(value: string | undefined) {
  const content = value?.trim() || '';
  if (!content) {
    throw new AppError(ErrorCode.PARAM_ERROR, '请写几句口味、分量或排队情况');
  }
  if (content.length > config.discover.maxContentLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `推荐说明不能超过 ${config.discover.maxContentLength} 个字`);
  }
  return content;
}

export function normalizeCommentContent(value: string) {
  const content = value.trim();
  if (!content) {
    throw new AppError(ErrorCode.PARAM_ERROR, '评论内容不能为空');
  }
  if (content.length > config.discover.maxCommentLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `评论内容不能超过 ${config.discover.maxCommentLength} 个字`);
  }
  return content;
}

export function normalizeTags(tags: string[]) {
  const normalized = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    if (tag.length > config.discover.maxTagLength) {
      throw new AppError(ErrorCode.PARAM_ERROR, `标签不能超过 ${config.discover.maxTagLength} 个字`);
    }

    const dedupeKey = tag.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(tag);
  }

  if (normalized.length === 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, '请至少填写一个标签');
  }

  if (normalized.length > config.discover.maxTagsPerPost) {
    throw new AppError(ErrorCode.PARAM_ERROR, `标签数量不能超过 ${config.discover.maxTagsPerPost} 个`);
  }

  return normalized;
}

export function normalizeCategory(category: string) {
  const value = category.trim();
  if (!isDiscoverCategory(value)) {
    throw new AppError(ErrorCode.PARAM_ERROR, '分类不合法');
  }
  return value;
}

export function roundRating(value: number) {
  return Math.round(value * 100) / 100;
}

export function toPostResponse(
  row: DiscoverRow,
  userId: number,
  userScore: number | null
): DiscoverPostResponse {
  const images = safeParseJsonArray<DiscoverStoredImage>(row.imagesJson, []);
  const tags = safeParseJsonArray<string>(row.tagsJson, []);

  return {
    id: row.id,
    title: row.title || '',
    storeName: row.storeName || '',
    priceText: row.priceText || '',
    content: row.content || '',
    category: row.category,
    tags,
    images,
    coverUrl: row.coverUrl,
    imageCount: row.imageCount,
    commentCount: row.commentCount,
    rating: {
      average: roundRating(Number(row.ratingAvg || 0)),
      count: row.ratingCount,
      total: row.ratingSum,
      userScore,
    },
    author: {
      id: row.userId,
      label: buildDiscoverAuthorLabel(row.authorClassName),
    },
    isMine: row.userId === userId,
    publishedAt: beijingIsoString(row.publishedAt),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export function toCommentResponse(row: DiscoverCommentRow, userId: number): DiscoverCommentResponse {
  return {
    id: row.id,
    postId: row.postId,
    parentCommentId: row.parentCommentId,
    content: row.content,
    avatarUrl: row.avatarUrl,
    author: {
      id: row.userId,
      label: buildDiscoverAuthorLabel(row.authorClassName),
    },
    isMine: row.userId === userId,
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}
