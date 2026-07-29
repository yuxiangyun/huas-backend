/**
 * [INPUT]: 依赖共享 AppError/ErrorCode 与北京时间格式化能力，不依赖 HTTP、数据库或文件系统
 * [OUTPUT]: 对外提供含社区资料投影的 Discover 稳定类型、校验规则、分页规则与响应映射纯函数
 * [POS]: modules/discover/domain 的领域内核，由 application 编排和 SQLite adapter 共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingIsoString } from '../../../utils/time';

export const DISCOVER_CATEGORIES = ['1食堂', '2食堂', '3食堂', '5食堂', '校外', '其他'] as const;
export const DISCOVER_COMMON_TAGS = ['好吃', '便宜', '分量足', '辣', '清淡', '排队久', '值得再吃'] as const;

export type DiscoverCategory = typeof DISCOVER_CATEGORIES[number];
export type DiscoverSort = 'latest' | 'score' | 'recommended';

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
  avatarUrl: string | null;
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
    nickname: string | null;
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
    nickname: string | null;
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
  avatarUrl: string | null;
  authorNickname: string | null;
  authorClassName: string | null;
}

export interface DiscoverCommentRow {
  id: number;
  postId: number;
  userId: number;
  parentCommentId: number | null;
  content: string;
  avatarUrl: string | null;
  authorNickname: string | null;
  authorClassName: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const RECOMMENDED_CANDIDATE_BASE_LIMIT = 120;
const RECOMMENDED_CANDIDATE_MULTIPLIER = 8;
const RECOMMENDED_CANDIDATE_MAX_LIMIT = 400;

export function getDiscoverMeta(policy: DiscoverPolicy) {
  return {
    categories: [...DISCOVER_CATEGORIES],
    commonTags: [...DISCOVER_COMMON_TAGS],
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

export function clampRecommendedCandidateLimit(page: number, pageSize: number) {
  const requested = page * pageSize * RECOMMENDED_CANDIDATE_MULTIPLIER;
  return Math.min(RECOMMENDED_CANDIDATE_MAX_LIMIT, Math.max(RECOMMENDED_CANDIDATE_BASE_LIMIT, requested));
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
  if (title.length > policy.maxTitleLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `标题不能超过 ${policy.maxTitleLength} 个字`);
  }
  return title;
}

export function normalizeStoreName(value: string | undefined, policy: DiscoverPolicy) {
  const storeName = value?.trim() || '';
  if (!storeName) return null;
  if (storeName.length > policy.maxStoreNameLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `档口或店名不能超过 ${policy.maxStoreNameLength} 个字`);
  }
  return storeName;
}

export function normalizePriceText(value: string | undefined, policy: DiscoverPolicy) {
  const priceText = value?.trim() || '';
  if (!priceText) return null;
  if (priceText.length > policy.maxPriceTextLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `价格信息不能超过 ${policy.maxPriceTextLength} 个字`);
  }
  return priceText;
}

export function normalizeContent(value: string | undefined, policy: DiscoverPolicy) {
  const content = value?.trim() || '';
  if (!content) throw new AppError(ErrorCode.PARAM_ERROR, '请写几句口味、分量或排队情况');
  if (content.length > policy.maxContentLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `推荐说明不能超过 ${policy.maxContentLength} 个字`);
  }
  return content;
}

export function normalizeCommentContent(value: string, policy: DiscoverPolicy) {
  const content = value.trim();
  if (!content) throw new AppError(ErrorCode.PARAM_ERROR, '评论内容不能为空');
  if (content.length > policy.maxCommentLength) {
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
    if (tag.length > policy.maxTagLength) {
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

export function buildDiscoverAuthorLabel(className: string | null | undefined): string {
  const raw = (className || '').trim();
  if (!raw) return '校园用户';
  const stripped = raw.replace(/\s+/g, ' ')
    .replace(/(?:19|20)\d{2}级/g, '')
    .replace(/\d{2,4}班/g, '')
    .replace(/\d{2,4}/g, ' ')
    .replace(/[()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || '校园用户';
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

export function roundRating(value: number) {
  return Math.round(value * 100) / 100;
}

export function toPostResponse(row: DiscoverRow, userId: number, userScore: number | null): DiscoverPostResponse {
  return {
    id: row.id,
    title: row.title || '',
    storeName: row.storeName || '',
    priceText: row.priceText || '',
    content: row.content || '',
    avatarUrl: row.avatarUrl,
    category: row.category,
    tags: safeParseJsonArray<string>(row.tagsJson, []),
    images: safeParseJsonArray<DiscoverStoredImage>(row.imagesJson, []),
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
      nickname: row.authorNickname?.trim() || null,
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
      nickname: row.authorNickname?.trim() || null,
    },
    isMine: row.userId === userId,
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}
