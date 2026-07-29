/**
 * [INPUT]: 依赖 Treehole 纯领域规则与构造注入的 persistence/avatar ports
 * [OUTPUT]: 对外提供 TreeholeApplicationService，编排前台社区、管理视图与共享昵称/头像用例
 * [POS]: modules/treehole/application 的唯一用例服务，不知道 Hono、Drizzle、Bun 或文件系统实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import {
  clampCommentPageSize,
  clampPage,
  clampPageSize,
  getTreeholeMeta,
  normalizeCommunityNickname,
  normalizeCommentContent,
  normalizePostContent,
  type AdminTreeholeCommentListOptions,
  type AdminTreeholePostListOptions,
  type CreateTreeholeCommentInput,
  type CreateTreeholePostInput,
  type ListOptions,
  type TreeholePolicy,
} from '../domain/treehole';
import type { TreeholeAvatarStorage, TreeholePersistence } from '../domain/ports';

export class TreeholeApplicationService {
  constructor(
    private readonly persistence: TreeholePersistence,
    private readonly avatarStorage: TreeholeAvatarStorage,
    private readonly policy: TreeholePolicy,
  ) {}

  getMeta() {
    return getTreeholeMeta(this.policy);
  }

  getAvatar(userId: number) {
    return this.persistence.getAvatar(userId);
  }

  getCommunityProfile(userId: number) {
    return this.persistence.getCommunityProfile(userId);
  }

  async updateCommunityProfile(userId: number, nicknameValue: unknown, avatar?: File) {
    const nickname = normalizeCommunityNickname(nicknameValue);
    const avatarUrl = avatar ? await this.avatarStorage.uploadAvatar(userId, avatar) : undefined;
    await this.persistence.setCommunityProfile(userId, { nickname, avatarUrl });
    return this.persistence.getCommunityProfile(userId);
  }

  async updateAvatar(userId: number, file: File) {
    const avatarUrl = await this.avatarStorage.uploadAvatar(userId, file);
    await this.persistence.setAvatarUrl(userId, avatarUrl);
    return this.persistence.getCommunityProfile(userId);
  }

  async clearAvatar(userId: number) {
    await this.avatarStorage.removeAvatar(userId);
    await this.persistence.setAvatarUrl(userId, null);
    return this.persistence.getCommunityProfile(userId);
  }

  getUnreadNotificationCount(userId: number) {
    return this.persistence.getUnreadNotificationCount(userId);
  }

  markAllNotificationsRead(userId: number) {
    return this.persistence.markAllNotificationsRead(userId);
  }

  listPosts(options: ListOptions) {
    return this.persistence.listPosts({
      userId: options.userId,
      page: clampPage(options.page),
      pageSize: clampPageSize(options.pageSize, this.policy),
    });
  }

  listMyPosts(options: ListOptions) {
    return this.persistence.listMyPosts({
      userId: options.userId,
      page: clampPage(options.page),
      pageSize: clampPageSize(options.pageSize, this.policy),
    });
  }

  createPost(input: CreateTreeholePostInput) {
    return this.persistence.createPost({
      userId: input.userId,
      content: normalizePostContent(input.content, this.policy),
    });
  }

  getPostDetail(userId: number, postId: number) {
    return this.persistence.getPostDetail(userId, postId);
  }

  likePost(userId: number, postId: number) {
    return this.persistence.likePost(userId, postId);
  }

  unlikePost(userId: number, postId: number) {
    return this.persistence.unlikePost(userId, postId);
  }

  listComments(userId: number, postId: number, options: { page?: number; pageSize?: number }) {
    return this.persistence.listComments(userId, postId, {
      page: clampPage(options.page),
      pageSize: clampCommentPageSize(options.pageSize, this.policy),
    });
  }

  createComment(input: CreateTreeholeCommentInput) {
    const parentCommentId = input.parentCommentId ?? null;
    if (parentCommentId !== null && (!Number.isInteger(parentCommentId) || parentCommentId <= 0)) {
      throw new AppError(ErrorCode.PARAM_ERROR, '父评论 ID 不合法');
    }
    return this.persistence.createComment({
      ...input,
      content: normalizeCommentContent(input.content, this.policy),
      parentCommentId,
    });
  }

  deletePost(postId: number, userId: number) {
    return this.persistence.deletePost(postId, userId);
  }

  deleteComment(commentId: number, userId: number) {
    return this.persistence.deleteComment(commentId, userId);
  }

  adminListPosts(options: AdminTreeholePostListOptions) {
    return this.persistence.adminListPosts({
      ...options,
      page: clampPage(options.page),
      pageSize: clampPageSize(options.pageSize, this.policy),
    });
  }

  adminListComments(postId: number, options: AdminTreeholeCommentListOptions) {
    return this.persistence.adminListComments(postId, {
      page: clampPage(options.page),
      pageSize: clampCommentPageSize(options.pageSize, this.policy),
    });
  }

  adminDeletePost(postId: number) {
    return this.persistence.adminDeletePost(postId);
  }

  adminDeleteComment(commentId: number) {
    return this.persistence.adminDeleteComment(commentId);
  }
}
