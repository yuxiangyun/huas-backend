/**
 * [INPUT]: 依赖 Treehole 领域 DTO，不依赖具体数据库、图片库或文件系统
 * [OUTPUT]: 对外提供 TreeholePersistence 与 TreeholeAvatarStorage 两个真实外部边界端口
 * [POS]: modules/treehole/domain 的依赖倒置契约，约束 application 仅通过端口访问 SQLite 与头像媒体
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type {
  AdminTreeholeCommentListOptions,
  AdminTreeholeCommentListResponse,
  AdminTreeholePostListOptions,
  AdminTreeholePostListResponse,
  PersistTreeholeCommentInput,
  TreeholeAvatarResponse,
  TreeholeCommentListResponse,
  TreeholeCommentResponse,
  TreeholeListResponse,
  TreeholePostResponse,
  TreeholeReadAllNotificationsResponse,
  TreeholeUnreadNotificationCountResponse,
} from './treehole';

export interface TreeholePersistence {
  getAvatar(userId: number): Promise<TreeholeAvatarResponse>;
  setAvatarUrl(userId: number, avatarUrl: string | null): Promise<void>;
  getUnreadNotificationCount(userId: number): Promise<TreeholeUnreadNotificationCountResponse>;
  markAllNotificationsRead(userId: number): Promise<TreeholeReadAllNotificationsResponse>;
  listPosts(options: { userId: number; page: number; pageSize: number }): Promise<TreeholeListResponse>;
  listMyPosts(options: { userId: number; page: number; pageSize: number }): Promise<TreeholeListResponse>;
  createPost(input: { userId: number; content: string }): Promise<TreeholePostResponse | null>;
  getPostDetail(userId: number, postId: number): Promise<TreeholePostResponse | null>;
  likePost(userId: number, postId: number): Promise<TreeholePostResponse | null>;
  unlikePost(userId: number, postId: number): Promise<TreeholePostResponse | null>;
  listComments(userId: number, postId: number, options: { page: number; pageSize: number }): Promise<TreeholeCommentListResponse | null>;
  createComment(input: PersistTreeholeCommentInput): Promise<TreeholeCommentResponse | null>;
  deletePost(postId: number, userId: number): Promise<{ id: number } | null>;
  deleteComment(commentId: number, userId: number): Promise<{ id: number; postId: number } | null>;
  adminListPosts(options: AdminTreeholePostListOptions & { page: number; pageSize: number }): Promise<AdminTreeholePostListResponse>;
  adminListComments(postId: number, options: { page: number; pageSize: number }): Promise<AdminTreeholeCommentListResponse | null>;
  adminDeletePost(postId: number): Promise<{ id: number } | null>;
  adminDeleteComment(commentId: number): Promise<{ id: number; postId: number } | null>;
  isPublishedAvatar(userId: number, publicPath: string): Promise<boolean>;
}

export interface TreeholeAvatarStorage {
  uploadAvatar(userId: number, file: File): Promise<string>;
  removeAvatar(userId: number): Promise<void>;
}
