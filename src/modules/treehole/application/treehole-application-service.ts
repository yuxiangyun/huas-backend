/**
 * [INPUT]: 依赖 Treehole 纯领域规则、构造注入的 persistence port 与 Notifications 提交后投影触发器
 * [OUTPUT]: 对外提供 TreeholeApplicationService，编排公开内容、用户帖子、活动投影与管理用例
 * [POS]: modules/treehole/application 的唯一用例服务，不知道 Hono、Drizzle、Bun、Notifications 实现或文件系统
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';
import type { ActivityProjectionTrigger } from '../../notifications/domain/ports';
import {
  clampCommentPageSize,
  clampPage,
  clampPageSize,
  getTreeholeMeta,
  normalizeCommentContent,
  normalizePostContent,
  type AdminTreeholeCommentListOptions,
  type AdminTreeholePostListOptions,
  type CreateTreeholeCommentInput,
  type CreateTreeholePostInput,
  type ListOptions,
  type TreeholePolicy,
} from '../domain/treehole';
import type { TreeholePersistence } from '../domain/ports';

export class TreeholeApplicationService {
  constructor(
    private readonly persistence: TreeholePersistence,
    private readonly policy: TreeholePolicy,
    private readonly activityProjection: ActivityProjectionTrigger,
  ) {}

  getMeta() {
    return getTreeholeMeta(this.policy);
  }

  listPosts(options: ListOptions) {
    return this.persistence.listPosts({
      userId: options.userId,
      page: clampPage(options.page),
      pageSize: clampPageSize(options.pageSize, this.policy),
    });
  }

  listMyPosts(options: ListOptions) {
    return this.listUserPosts(options.userId, options.userId, options);
  }

  listUserPosts(
    viewerUserId: number,
    authorUserId: number,
    options: { page?: number; pageSize?: number },
  ) {
    if (!Number.isInteger(authorUserId) || authorUserId <= 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '用户 ID 不合法');
    }
    return this.persistence.listUserPosts({
      viewerUserId,
      authorUserId,
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

  async likePost(userId: number, postId: number) {
    const result = await this.persistence.likePost(userId, postId);
    if (result) await this.attemptActivityProjection();
    return result;
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

  async createComment(input: CreateTreeholeCommentInput) {
    const parentCommentId = input.parentCommentId ?? null;
    if (parentCommentId !== null && (!Number.isInteger(parentCommentId) || parentCommentId <= 0)) {
      throw new AppError(ErrorCode.PARAM_ERROR, '父评论 ID 不合法');
    }
    const result = await this.persistence.createComment({
      ...input,
      content: normalizeCommentContent(input.content, this.policy),
      parentCommentId,
    });
    if (result) await this.attemptActivityProjection();
    return result;
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

  private async attemptActivityProjection(): Promise<void> {
    try {
      await this.activityProjection.attempt();
    } catch (error: any) {
      Logger.warn('TreeholeActivity', '提交后活动通知投影失败，等待周期重试', error?.message || String(error));
    }
  }
}
