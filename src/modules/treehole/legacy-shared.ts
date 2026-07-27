/**
 * [INPUT]: 依赖 Treehole domain、SQLite 专属 helper 与 config.treehole 运行时策略
 * [OUTPUT]: 对外提供旧 treehole-shared 的完整运行时导出、无 policy 参数签名与共享类型
 * [POS]: modules/treehole composition-level 兼容出口，仅供旧 Facade；canonical application 不得依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../config';
import {
  clampCommentPageSize as canonicalClampCommentPageSize,
  clampPageSize as canonicalClampPageSize,
  getTreeholeMeta as canonicalGetTreeholeMeta,
  normalizeCommentContent as canonicalNormalizeCommentContent,
  normalizePostContent as canonicalNormalizePostContent,
} from './domain/treehole';

function legacyPolicy() {
  return {
    maxPostLength: config.treehole.maxPostLength,
    maxCommentLength: config.treehole.maxCommentLength,
    defaultPageSize: config.treehole.defaultPageSize,
    maxPageSize: config.treehole.maxPageSize,
    defaultCommentPageSize: config.treehole.defaultCommentPageSize,
    maxCommentPageSize: config.treehole.maxCommentPageSize,
  };
}

export function getTreeholeMeta() {
  return canonicalGetTreeholeMeta(legacyPolicy());
}

export function clampPageSize(pageSize: number | undefined) {
  return canonicalClampPageSize(pageSize, legacyPolicy());
}

export function clampCommentPageSize(pageSize: number | undefined) {
  return canonicalClampCommentPageSize(pageSize, legacyPolicy());
}

export function normalizePostContent(value: string) {
  return canonicalNormalizePostContent(value, legacyPolicy());
}

export function normalizeCommentContent(value: string) {
  return canonicalNormalizeCommentContent(value, legacyPolicy());
}

export {
  clampPage,
  formatLikeKeyword,
  toAdminCommentResponse,
  toAdminPostResponse,
  toCommentResponse,
  toPostResponse,
} from './domain/treehole';

export type {
  AdminAuthorSummary,
  AdminTreeholeCommentListOptions,
  AdminTreeholeCommentListResponse,
  AdminTreeholeCommentResponse,
  AdminTreeholeCommentRow,
  AdminTreeholePostListOptions,
  AdminTreeholePostListResponse,
  AdminTreeholePostResponse,
  AdminTreeholePostRow,
  CreateTreeholeCommentInput,
  CreateTreeholePostInput,
  ListOptions,
  TreeholeAvatarResponse,
  TreeholeCommentListResponse,
  TreeholeCommentResponse,
  TreeholeCommentRow,
  TreeholeListResponse,
  TreeholeNotificationType,
  TreeholePostResponse,
  TreeholePostRow,
  TreeholeReadAllNotificationsResponse,
  TreeholeUnreadNotificationCountResponse,
} from './domain/treehole';

export {
  adminCommentSelect,
  adminPostSelect,
  commentSelect,
  findPublicPost,
  getLikedMap,
  getTreeholeAvatarMap,
  postSelect,
  refreshPostCommentCount,
  refreshPostLikeCount,
  toPostListResponse,
} from './infrastructure/sqlite-treehole-support';
