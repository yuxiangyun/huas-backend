/**
 * [INPUT]: 依赖 Treehole application、SQLite persistence、头像媒体 adapter 与运行时配置
 * [OUTPUT]: 对外提供 canonical application 实例及旧静态类名兼容出口
 * [POS]: modules/treehole 的唯一 composition root，集中连接 ports 与 infrastructure adapters
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../config';
import { TreeholeApplicationService } from './application/treehole-application-service';
import type {
  AdminTreeholeCommentListOptions,
  AdminTreeholePostListOptions,
  CreateTreeholeCommentInput,
  CreateTreeholePostInput,
  ListOptions,
} from './domain/treehole';
import { TreeholeAvatarMediaStorage } from './infrastructure/treehole-avatar-media-storage';
import { SQLiteTreeholePersistence } from './infrastructure/sqlite-treehole-persistence';

const treeholePolicy = {
  maxPostLength: config.treehole.maxPostLength,
  maxCommentLength: config.treehole.maxCommentLength,
  defaultPageSize: config.treehole.defaultPageSize,
  maxPageSize: config.treehole.maxPageSize,
  defaultCommentPageSize: config.treehole.defaultCommentPageSize,
  maxCommentPageSize: config.treehole.maxCommentPageSize,
};

const treeholePersistence = new SQLiteTreeholePersistence();
const treeholeAvatarStorage = new TreeholeAvatarMediaStorage(treeholePersistence);

export const treeholeApplicationService = new TreeholeApplicationService(
  treeholePersistence,
  treeholeAvatarStorage,
  treeholePolicy,
);

export class TreeholeUserService {
  static getMeta() { return treeholeApplicationService.getMeta(); }
  static getAvatar(userId: number) { return treeholeApplicationService.getAvatar(userId); }
  static updateAvatar(userId: number, file: File) { return treeholeApplicationService.updateAvatar(userId, file); }
  static clearAvatar(userId: number) { return treeholeApplicationService.clearAvatar(userId); }
  static getUnreadNotificationCount(userId: number) {
    return treeholeApplicationService.getUnreadNotificationCount(userId);
  }
  static markAllNotificationsRead(userId: number) { return treeholeApplicationService.markAllNotificationsRead(userId); }
  static listPosts(options: ListOptions) { return treeholeApplicationService.listPosts(options); }
  static listMyPosts(options: ListOptions) { return treeholeApplicationService.listMyPosts(options); }
  static createPost(input: CreateTreeholePostInput) { return treeholeApplicationService.createPost(input); }
  static getPostDetail(userId: number, postId: number) {
    return treeholeApplicationService.getPostDetail(userId, postId);
  }
  static likePost(userId: number, postId: number) { return treeholeApplicationService.likePost(userId, postId); }
  static unlikePost(userId: number, postId: number) { return treeholeApplicationService.unlikePost(userId, postId); }
  static listComments(userId: number, postId: number, options: { page?: number; pageSize?: number }) {
    return treeholeApplicationService.listComments(userId, postId, options);
  }
  static createComment(input: CreateTreeholeCommentInput) { return treeholeApplicationService.createComment(input); }
  static deletePost(postId: number, userId: number) { return treeholeApplicationService.deletePost(postId, userId); }
  static deleteComment(commentId: number, userId: number) {
    return treeholeApplicationService.deleteComment(commentId, userId);
  }
}

export class TreeholeAdminService {
  static listPosts(options: AdminTreeholePostListOptions) {
    return treeholeApplicationService.adminListPosts(options);
  }
  static listComments(postId: number, options: AdminTreeholeCommentListOptions) {
    return treeholeApplicationService.adminListComments(postId, options);
  }
  static deletePost(postId: number) { return treeholeApplicationService.adminDeletePost(postId); }
  static deleteComment(commentId: number) { return treeholeApplicationService.adminDeleteComment(commentId); }
}

export class TreeholeService extends TreeholeUserService {
  static adminListPosts(options: AdminTreeholePostListOptions) { return TreeholeAdminService.listPosts(options); }
  static adminListComments(postId: number, options: AdminTreeholeCommentListOptions) {
    return TreeholeAdminService.listComments(postId, options);
  }
  static adminDeletePost(postId: number) { return TreeholeAdminService.deletePost(postId); }
  static adminDeleteComment(commentId: number) { return TreeholeAdminService.deleteComment(commentId); }
}

export class TreeholeAvatarMediaService {
  static uploadAvatar(userId: number, file: File) { return treeholeAvatarStorage.uploadAvatar(userId, file); }
  static removeAvatar(userId: number) { return treeholeAvatarStorage.removeAvatar(userId); }
  static getPublicFile(requestPath: string) { return treeholeAvatarStorage.getPublicFile(requestPath); }
}

export { TREEHOLE_AVATAR_CACHE_CONTROL } from './infrastructure/treehole-avatar-media-storage';
