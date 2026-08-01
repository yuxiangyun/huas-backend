/**
 * [INPUT]: 依赖 Community 公共资料 DTO、共享 AppError/ErrorCode 与北京时间格式化能力
 * [OUTPUT]: 对外提供 Discover 帖子/评论/点赞稳定类型、Unicode code point 校验、分页规则与响应映射纯函数
 * [POS]: modules/discover/domain 的领域内核，只描述 Discover 事实并通过 CommunityProfile 接收作者投影
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingIsoString } from '../../../utils/time';
import type { CommunityProfile } from '../../community/domain/community';

export const DISCOVER_CATEGORIES = ['1食堂', '2食堂', '3食堂', '5食堂', '校外', '其他'] as const;
export const DISCOVER_COMMON_TAGS = ['好吃', '便宜', '分量足', '辣', '清淡', '排队久', '值得再吃'] as const;

export type DiscoverCategory = typeof DISCOVER_CATEGORIES[number];
export type DiscoverSort = 'latest' | 'popular' | 'recommended';

export interface DiscoverPolicy {
  maxImagesPerPost: number;
  maxTagsPerPost: number;
  maxTitleLength: number;
  maxTagLength: number;
  maxStoreNameLength: number;
  maxPriceTextLength: number;
  maxContentLength: number;
  maxCommentLength: number;
  defaultCommentPageSize: number;
  maxCommentPageSize: number;
}

export interface DiscoverStoredImage {
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

export interface StoredDiscoverMedia {
  storageKey: string;
  images: DiscoverStoredImage[];
  coverUrl: string;
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

export interface PersistDiscoverPostInput {
  userId: number;
  title: string;
  storeName: string | null;
  priceText: string | null;
  content: string;
  category: DiscoverCategory;
  tags: string[];
  media: StoredDiscoverMedia;
}

export interface CreateDiscoverCommentInput {
  userId: number;
  postId: number;
  content: string;
  parentCommentId?: number | null;
}

export interface PersistDiscoverCommentInput {
  userId: number;
  postId: number;
  content: string;
  parentCommentId: number | null;
}

export interface ListOptions {
  userId: number;
  category?: string;
  page?: number;
  pageSize?: number;
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
  likeCount: number;
  likedByMe: boolean;
  author: CommunityProfile;
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
  author: CommunityProfile;
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
  likeCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date;
  deletedAt: Date | null;
  storageKey: string;
}

export interface DiscoverCommentRow {
  id: number;
  postId: number;
  userId: number;
  parentCommentId: number | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function codePointLength(value: string) {
  return Array.from(value).length;
}

export function getDiscoverMeta(policy: DiscoverPolicy) {
  return {
    categories: [...DISCOVER_CATEGORIES],
    commonTags: [...DISCOVER_COMMON_TAGS],
    sorts: ['latest', 'popular', 'recommended'] as DiscoverSort[],
    limits: {
      maxImagesPerPost: policy.maxImagesPerPost,
      maxTagsPerPost: policy.maxTagsPerPost,
      maxTitleLength: policy.maxTitleLength,
      maxTagLength: policy.maxTagLength,
      maxStoreNameLength: policy.maxStoreNameLength,
      maxPriceTextLength: policy.maxPriceTextLength,
      maxContentLength: policy.maxContentLength,
      maxCommentLength: policy.maxCommentLength,
    },
    pagination: {
      defaultCommentPageSize: policy.defaultCommentPageSize,
      maxCommentPageSize: policy.maxCommentPageSize,
    },
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

export function clampCommentPageSize(pageSize: number | undefined, policy: DiscoverPolicy) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) return policy.defaultCommentPageSize;
  return Math.min(Math.floor(pageSize), policy.maxCommentPageSize);
}

export function normalizePostInput(input: CreatePostInput, policy: DiscoverPolicy): Omit<PersistDiscoverPostInput, 'media'> {
  return {
    userId: input.userId,
    title: normalizeTitle(input.title, policy),
    storeName: normalizeStoreName(input.storeName, policy),
    priceText: normalizePriceText(input.priceText, policy),
    content: normalizeContent(input.content, policy),
    category: normalizeCategory(input.category),
    tags: normalizeTags(input.tags, policy),
  };
}

export function normalizeTitle(value: string | undefined, policy: DiscoverPolicy) {
  const title = value?.trim() || '';
  if (!title) throw new AppError(ErrorCode.PARAM_ERROR, '请写清楚这顿饭叫什么');
  if (codePointLength(title) > policy.maxTitleLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `标题不能超过 ${policy.maxTitleLength} 个字`);
  }
  return title;
}

export function normalizeStoreName(value: string | undefined, policy: DiscoverPolicy) {
  const storeName = value?.trim() || '';
  if (!storeName) return null;
  if (codePointLength(storeName) > policy.maxStoreNameLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `档口或店名不能超过 ${policy.maxStoreNameLength} 个字`);
  }
  return storeName;
}

export function normalizePriceText(value: string | undefined, policy: DiscoverPolicy) {
  const priceText = value?.trim() || '';
  if (!priceText) return null;
  if (codePointLength(priceText) > policy.maxPriceTextLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `价格信息不能超过 ${policy.maxPriceTextLength} 个字`);
  }
  return priceText;
}

export function normalizeContent(value: string | undefined, policy: DiscoverPolicy) {
  const content = value?.trim() || '';
  if (!content) throw new AppError(ErrorCode.PARAM_ERROR, '请写几句口味、分量或排队情况');
  if (codePointLength(content) > policy.maxContentLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `推荐说明不能超过 ${policy.maxContentLength} 个字`);
  }
  return content;
}

export function normalizeCommentContent(value: string, policy: DiscoverPolicy) {
  const content = value.trim();
  if (!content) throw new AppError(ErrorCode.PARAM_ERROR, '评论内容不能为空');
  if (codePointLength(content) > policy.maxCommentLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `评论内容不能超过 ${policy.maxCommentLength} 个字`);
  }
  return content;
}

export function normalizeTags(tags: string[], policy: DiscoverPolicy) {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    if (codePointLength(tag) > policy.maxTagLength) {
      throw new AppError(ErrorCode.PARAM_ERROR, `标签不能超过 ${policy.maxTagLength} 个字`);
    }
    const dedupeKey = tag.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(tag);
  }
  if (normalized.length === 0) throw new AppError(ErrorCode.PARAM_ERROR, '请至少填写一个标签');
  if (normalized.length > policy.maxTagsPerPost) {
    throw new AppError(ErrorCode.PARAM_ERROR, `标签数量不能超过 ${policy.maxTagsPerPost} 个`);
  }
  return normalized;
}

export function normalizeCategory(category: string) {
  const value = category.trim();
  if (!isDiscoverCategory(value)) throw new AppError(ErrorCode.PARAM_ERROR, '分类不合法');
  return value;
}

export function validateImages(files: File[], policy: DiscoverPolicy) {
  if (files.length === 0) throw new AppError(ErrorCode.PARAM_ERROR, '至少上传一张图片');
  if (files.length > policy.maxImagesPerPost) {
    throw new AppError(ErrorCode.PARAM_ERROR, `最多上传 ${policy.maxImagesPerPost} 张图片`);
  }
}

export function isDiscoverCategory(value: string): value is DiscoverCategory {
  return DISCOVER_CATEGORIES.includes(value as DiscoverCategory);
}

export function parseStringArray(value: string): string[] {
  const raw = value.trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? '').trim()).filter(Boolean);
    } catch {
      // 兼容旧客户端的逗号与换行分隔输入。
    }
  }
  return raw.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);
}

export function safeParseJsonArray<T>(value: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

export function toPostResponse(
  row: DiscoverRow,
  viewerUserId: number,
  likedByMe: boolean,
  author: CommunityProfile,
): DiscoverPostResponse {
  return {
    id: row.id,
    title: row.title || '',
    storeName: row.storeName || '',
    priceText: row.priceText || '',
    content: row.content || '',
    category: row.category,
    tags: safeParseJsonArray<string>(row.tagsJson, []),
    images: safeParseJsonArray<DiscoverStoredImage>(row.imagesJson, []),
    coverUrl: row.coverUrl,
    imageCount: row.imageCount,
    commentCount: row.commentCount,
    likeCount: row.likeCount,
    likedByMe,
    author,
    isMine: row.userId === viewerUserId,
    publishedAt: beijingIsoString(row.publishedAt),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export function toCommentResponse(
  row: DiscoverCommentRow,
  viewerUserId: number,
  author: CommunityProfile,
): DiscoverCommentResponse {
  return {
    id: row.id,
    postId: row.postId,
    parentCommentId: row.parentCommentId,
    content: row.content,
    author,
    isMine: row.userId === viewerUserId,
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}
