/**
 * [INPUT]: 依赖共享 AppError/ErrorCode 与北京时间格式化能力，不依赖 HTTP、数据库、Bun 或文件系统
 * [OUTPUT]: 对外提供含私有图片的 Treehole 稳定类型、Unicode code point 内容规则、LIKE 转义及统一公共作者响应映射
 * [POS]: modules/treehole/domain 的纯领域内核，所有内容显式绑定 Community 公共作者
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingIsoString } from '../../../utils/time';
import type { CommunityProfile } from '../../community/domain/community';

export interface TreeholePolicy {
  maxPostLength: number;
  maxCommentLength: number;
  defaultPageSize: number;
  maxPageSize: number;
  defaultCommentPageSize: number;
  maxCommentPageSize: number;
  maxImagesPerPost: number;
  maxImageBytes: number;
  maxImageTotalBytes: number;
  maxImagePixels: number;
  maxOutputImageBytes: number;
  imageMaxDimension: number;
  imageQuality: number;
  allowAnimatedImages: boolean;
  orphanMediaGraceMs: number;
}

export interface ListOptions {
  userId: number;
  page?: number;
  pageSize?: number;
}

export interface CreateTreeholePostInput {
  userId: number;
  content: string;
  images: readonly File[];
}

export interface TreeholeStoredImage {
  fileName: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/webp';
}

export interface StoredTreeholeMedia {
  mediaKey: string;
  images: TreeholeStoredImage[];
}

export interface TreeholeImageResponse {
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/webp';
}

export type TreeholeMediaUrlFactory = (mediaKey: string, fileName: string) => string;

const TREEHOLE_MEDIA_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TREEHOLE_IMAGE_FILE_NAME_PATTERN = /^0[1-9]\.webp$/u;

export function isTreeholeMediaKey(value: string) {
  return TREEHOLE_MEDIA_KEY_PATTERN.test(value);
}

export function isTreeholeImageFileName(value: string) {
  return TREEHOLE_IMAGE_FILE_NAME_PATTERN.test(value);
}

export interface CreateTreeholeCommentInput {
  userId: number;
  postId: number;
  content: string;
  parentCommentId?: number | null;
}

export interface PersistTreeholeCommentInput extends Omit<CreateTreeholeCommentInput, 'parentCommentId'> {
  parentCommentId: number | null;
}

export interface TreeholePostRow {
  id: number;
  userId: number;
  content: string;
  mediaKey: string | null;
  imagesJson: string;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date;
  deletedAt: Date | null;
}

export interface TreeholeCommentRow {
  id: number;
  postId: number;
  userId: number;
  parentCommentId: number | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TreeholePostResponse {
  id: number;
  content: string;
  author: CommunityProfile;
  images: TreeholeImageResponse[];
  imageCount: number;
  stats: { likeCount: number; commentCount: number };
  viewer: { liked: boolean; isMine: boolean };
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreeholeCommentResponse {
  id: number;
  postId: number;
  parentCommentId: number | null;
  content: string;
  author: CommunityProfile;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTreeholePostResponse {
  id: number;
  content: string;
  images: TreeholeImageResponse[];
  imageCount: number;
  stats: { likeCount: number; commentCount: number };
  author: CommunityProfile;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTreeholeCommentResponse {
  id: number;
  postId: number;
  content: string;
  author: CommunityProfile;
  createdAt: string;
  updatedAt: string;
}

export interface TreeholeListResponse {
  items: TreeholePostResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface TreeholeCommentListResponse {
  items: TreeholeCommentResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface AdminTreeholePostListResponse {
  summary: { totalPosts: number; totalComments: number; totalLikes: number };
  items: AdminTreeholePostResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface AdminTreeholeCommentListResponse {
  items: AdminTreeholeCommentResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface AdminTreeholePostListOptions {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface AdminTreeholeCommentListOptions {
  page?: number;
  pageSize?: number;
}

export function getTreeholeMeta(policy: TreeholePolicy) {
  return {
    limits: {
      maxPostLength: policy.maxPostLength,
      maxCommentLength: policy.maxCommentLength,
      maxImagesPerPost: policy.maxImagesPerPost,
      maxImageBytes: policy.maxImageBytes,
      maxImageTotalBytes: policy.maxImageTotalBytes,
      maxImagePixels: policy.maxImagePixels,
      maxOutputImageBytes: policy.maxOutputImageBytes,
      imageMaxDimension: policy.imageMaxDimension,
      imageQuality: policy.imageQuality,
      allowAnimatedImages: policy.allowAnimatedImages,
    },
    pagination: {
      defaultPageSize: policy.defaultPageSize,
      maxPageSize: policy.maxPageSize,
      defaultCommentPageSize: policy.defaultCommentPageSize,
      maxCommentPageSize: policy.maxCommentPageSize,
    },
  };
}

export function clampPage(page: number | undefined) {
  if (!page || !Number.isFinite(page) || page <= 0) return 1;
  return Math.floor(page);
}

export function clampPageSize(pageSize: number | undefined, policy: TreeholePolicy) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) return policy.defaultPageSize;
  return Math.min(Math.floor(pageSize), policy.maxPageSize);
}

export function clampCommentPageSize(pageSize: number | undefined, policy: TreeholePolicy) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) return policy.defaultCommentPageSize;
  return Math.min(Math.floor(pageSize), policy.maxCommentPageSize);
}

export function normalizePostContent(value: string, policy: TreeholePolicy) {
  const content = value.trim();
  if (!content) throw new AppError(ErrorCode.PARAM_ERROR, '树洞内容不能为空');
  if (Array.from(content).length > policy.maxPostLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `树洞内容不能超过 ${policy.maxPostLength} 个字`);
  }
  return content;
}

export function normalizeCommentContent(value: string, policy: TreeholePolicy) {
  const content = value.trim();
  if (!content) throw new AppError(ErrorCode.PARAM_ERROR, '评论内容不能为空');
  if (Array.from(content).length > policy.maxCommentLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `评论内容不能超过 ${policy.maxCommentLength} 个字`);
  }
  return content;
}

export function validateTreeholeImages(files: readonly File[], policy: TreeholePolicy) {
  const maxImages = Math.min(9, policy.maxImagesPerPost);
  if (files.length > maxImages) {
    throw new AppError(ErrorCode.PARAM_ERROR, `每篇帖子最多上传 ${maxImages} 张图片`);
  }

  let totalBytes = 0;
  for (const file of files) {
    if (!(file instanceof File) || !Number.isSafeInteger(file.size) || file.size <= 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '图片文件不能为空');
    }
    if (file.size > policy.maxImageBytes) {
      throw new AppError(ErrorCode.PARAM_ERROR, '单张图片超过允许的大小限制');
    }
    totalBytes += file.size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > policy.maxImageTotalBytes) {
      throw new AppError(ErrorCode.PARAM_ERROR, '帖子图片总大小超过允许的限制');
    }
  }
}

export function parseTreeholeStoredImages(value: string): TreeholeStoredImage[] {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(candidate) || candidate.length > 9) return [];

  const fileNames = new Set<string>();
  const images: TreeholeStoredImage[] = [];
  for (const item of candidate) {
    if (!isStoredImage(item) || fileNames.has(item.fileName)) return [];
    fileNames.add(item.fileName);
    images.push(item);
  }
  return images;
}

function isStoredImage(value: unknown): value is TreeholeStoredImage {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.fileName === 'string'
    && isTreeholeImageFileName(item.fileName)
    && Number.isSafeInteger(item.width) && Number(item.width) > 0
    && Number.isSafeInteger(item.height) && Number(item.height) > 0
    && Number.isSafeInteger(item.sizeBytes) && Number(item.sizeBytes) > 0
    && item.mimeType === 'image/webp';
}

function projectPostImages(
  row: Pick<TreeholePostRow, 'mediaKey' | 'imagesJson'>,
  urlFor: TreeholeMediaUrlFactory,
) {
  if (!row.mediaKey || !isTreeholeMediaKey(row.mediaKey)) return [];
  return parseTreeholeStoredImages(row.imagesJson).map(({ fileName, ...image }) => ({
    ...image,
    url: urlFor(row.mediaKey!, fileName),
  }));
}

export function formatLikeKeyword(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

export function toPostResponse(
  row: TreeholePostRow,
  userId: number,
  liked: boolean,
  author: CommunityProfile,
  mediaUrlFor: TreeholeMediaUrlFactory,
): TreeholePostResponse {
  const images = projectPostImages(row, mediaUrlFor);
  return {
    id: row.id,
    content: row.content,
    author,
    images,
    imageCount: images.length,
    stats: { likeCount: row.likeCount, commentCount: row.commentCount },
    viewer: { liked, isMine: row.userId === userId },
    publishedAt: beijingIsoString(row.publishedAt),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export function toAdminPostResponse(
  row: TreeholePostRow,
  author: CommunityProfile,
  mediaUrlFor: TreeholeMediaUrlFactory,
): AdminTreeholePostResponse {
  const images = projectPostImages(row, mediaUrlFor);
  return {
    id: row.id,
    content: row.content,
    images,
    imageCount: images.length,
    stats: { likeCount: row.likeCount, commentCount: row.commentCount },
    author,
    publishedAt: beijingIsoString(row.publishedAt),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export function toCommentResponse(
  row: TreeholeCommentRow,
  userId: number,
  author: CommunityProfile,
): TreeholeCommentResponse {
  return {
    id: row.id,
    postId: row.postId,
    parentCommentId: row.parentCommentId,
    content: row.content,
    author,
    isMine: row.userId === userId,
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export function toAdminCommentResponse(
  row: TreeholeCommentRow,
  author: CommunityProfile,
): AdminTreeholeCommentResponse {
  return {
    id: row.id,
    postId: row.postId,
    content: row.content,
    author,
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}
