/**
 * [INPUT]: 依赖共享 AppError/ErrorCode 与北京时间格式化能力，不依赖 HTTP、数据库、Bun 或文件系统
 * [OUTPUT]: 对外提供 Treehole 稳定类型、分页/内容规则与统一公共作者的前台/管理响应映射
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
}

export interface ListOptions {
  userId: number;
  page?: number;
  pageSize?: number;
}

export interface CreateTreeholePostInput {
  userId: number;
  content: string;
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
  if (content.length > policy.maxPostLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `树洞内容不能超过 ${policy.maxPostLength} 个字`);
  }
  return content;
}

export function normalizeCommentContent(value: string, policy: TreeholePolicy) {
  const content = value.trim();
  if (!content) throw new AppError(ErrorCode.PARAM_ERROR, '评论内容不能为空');
  if (content.length > policy.maxCommentLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `评论内容不能超过 ${policy.maxCommentLength} 个字`);
  }
  return content;
}

export function formatLikeKeyword(value: string) {
  return `%${value.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

export function toPostResponse(
  row: TreeholePostRow,
  userId: number,
  liked: boolean,
  author: CommunityProfile,
): TreeholePostResponse {
  return {
    id: row.id,
    content: row.content,
    author,
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
): AdminTreeholePostResponse {
  return {
    id: row.id,
    content: row.content,
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
