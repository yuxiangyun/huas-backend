/**
 * [INPUT]: 依赖共享 AppError/ErrorCode 与北京时间格式化能力，不依赖 HTTP、数据库、Bun 或文件系统
 * [OUTPUT]: 对外提供 Treehole 稳定类型、社区昵称校验、分页规则与前台/管理响应映射
 * [POS]: modules/treehole/domain 的纯领域内核，公共视图只投影社区昵称/头像并隔离真实作者资料
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingIsoString } from '../../../utils/time';

export const COMMUNITY_NICKNAME_MIN_LENGTH = 2;
export const COMMUNITY_NICKNAME_MAX_LENGTH = 12;

const COMMUNITY_NICKNAME_PATTERN = /^[\p{Script=Han}A-Za-z0-9_]+$/u;
const RESERVED_COMMUNITY_NICKNAMES = new Set(['管理员', '官方', '系统', '匿名用户']);

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

export type TreeholeNotificationType = 'post_comment' | 'comment_reply';

export interface AdminTreeholePostRow extends TreeholePostRow {
  authorStudentId: string;
  authorName: string | null;
  authorClassName: string | null;
}

export interface AdminTreeholeCommentRow extends TreeholeCommentRow {
  authorStudentId: string;
  authorName: string | null;
  authorClassName: string | null;
}

export interface TreeholePostResponse {
  id: number;
  content: string;
  avatarUrl: string | null;
  nickname: string | null;
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
  avatarUrl: string | null;
  nickname: string | null;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityProfileResponse {
  avatarUrl: string | null;
  nickname: string | null;
}

export interface TreeholeAvatarResponse { avatarUrl: string | null }
export interface TreeholeUnreadNotificationCountResponse { unreadCount: number }
export interface TreeholeReadAllNotificationsResponse { readCount: number }

export interface AdminAuthorSummary {
  id: number;
  studentId: string;
  name: string;
  className: string;
}

export interface AdminTreeholePostResponse {
  id: number;
  content: string;
  stats: { likeCount: number; commentCount: number };
  author: AdminAuthorSummary;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTreeholeCommentResponse {
  id: number;
  postId: number;
  content: string;
  author: AdminAuthorSummary;
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

export function normalizeCommunityNickname(value: unknown): string | null {
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.PARAM_ERROR, '昵称必须是字符串');
  }

  const nickname = value.trim();
  if (!nickname) return null;

  const length = Array.from(nickname).length;
  if (length < COMMUNITY_NICKNAME_MIN_LENGTH || length > COMMUNITY_NICKNAME_MAX_LENGTH) {
    throw new AppError(
      ErrorCode.PARAM_ERROR,
      `昵称长度必须为 ${COMMUNITY_NICKNAME_MIN_LENGTH}-${COMMUNITY_NICKNAME_MAX_LENGTH} 个字符`,
    );
  }
  if (!COMMUNITY_NICKNAME_PATTERN.test(nickname)) {
    throw new AppError(ErrorCode.PARAM_ERROR, '昵称只能包含中文、英文字母、数字和下划线');
  }
  if (RESERVED_COMMUNITY_NICKNAMES.has(nickname)) {
    throw new AppError(ErrorCode.PARAM_ERROR, '该昵称不可使用');
  }

  return nickname;
}

export function formatLikeKeyword(value: string) {
  return `%${value.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

function toAdminAuthorSummary(row: AdminTreeholePostRow | AdminTreeholeCommentRow): AdminAuthorSummary {
  return {
    id: row.userId,
    studentId: row.authorStudentId,
    name: row.authorName?.trim() || '',
    className: row.authorClassName?.trim() || '',
  };
}

export function toPostResponse(
  row: TreeholePostRow,
  userId: number,
  liked: boolean,
  profile: CommunityProfileResponse,
): TreeholePostResponse {
  return {
    id: row.id,
    content: row.content,
    avatarUrl: profile.avatarUrl,
    nickname: profile.nickname,
    stats: { likeCount: row.likeCount, commentCount: row.commentCount },
    viewer: { liked, isMine: row.userId === userId },
    publishedAt: beijingIsoString(row.publishedAt),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export function toAdminPostResponse(row: AdminTreeholePostRow): AdminTreeholePostResponse {
  return {
    id: row.id,
    content: row.content,
    stats: { likeCount: row.likeCount, commentCount: row.commentCount },
    author: toAdminAuthorSummary(row),
    publishedAt: beijingIsoString(row.publishedAt),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export function toCommentResponse(
  row: TreeholeCommentRow,
  userId: number,
  profile: CommunityProfileResponse,
): TreeholeCommentResponse {
  return {
    id: row.id,
    postId: row.postId,
    parentCommentId: row.parentCommentId,
    content: row.content,
    avatarUrl: profile.avatarUrl,
    nickname: profile.nickname,
    isMine: row.userId === userId,
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export function toAdminCommentResponse(row: AdminTreeholeCommentRow): AdminTreeholeCommentResponse {
  return {
    id: row.id,
    postId: row.postId,
    content: row.content,
    author: toAdminAuthorSummary(row),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}
