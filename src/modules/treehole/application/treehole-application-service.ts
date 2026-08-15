/**
 * [INPUT]: 依赖 Treehole 纯领域规则、构造注入的 persistence/media ports 与 Notifications 提交后投影触发器
 * [OUTPUT]: 对外提供 TreeholeApplicationService，编排图文帖子、用户/管理删除补偿、私有媒体读取、孤儿回收与活动投影用例
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
  validateTreeholeImages,
  type AdminTreeholeCommentListOptions,
  type AdminTreeholePostListOptions,
  type CreateTreeholeCommentInput,
  type CreateTreeholePostInput,
  type ListOptions,
  type TreeholePolicy,
} from '../domain/treehole';
import type {
  TreeholeMediaReader,
  TreeholeMediaStorage,
  TreeholePersistence,
} from '../domain/ports';

type TreeholeMediaPort = TreeholeMediaStorage & Pick<TreeholeMediaReader, 'getForUser'>;

export class TreeholeApplicationService {
  constructor(
    private readonly persistence: TreeholePersistence,
    private readonly media: TreeholeMediaPort,
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

  async createPost(input: CreateTreeholePostInput) {
    const content = normalizePostContent(input.content, this.policy);
    validateTreeholeImages(input.images, this.policy);
    const media = await this.media.prepare(input.images);
    let postId: number;
    try {
      postId = await this.persistence.createPost({ userId: input.userId, content, media });
    } catch (error) {
      try {
        await this.media.removeStorage(media?.mediaKey ?? null);
      } catch (cleanupError) {
        Logger.error('TreeholeMedia', '帖子写库失败后媒体补偿也失败', cleanupError);
      }
      throw error;
    }
    // 投影在补偿边界之外：写库成功后任何投影失败都不得回收已入库帖子的媒体。
    return this.persistence.getPostDetail(input.userId, postId);
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

  async deletePost(postId: number, userId: number) {
    const removed = await this.persistence.deletePost(postId, userId);
    return this.cleanupDeletedPostMedia(removed);
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

  async adminDeletePost(postId: number) {
    const removed = await this.persistence.adminDeletePost(postId);
    return this.cleanupDeletedPostMedia(removed);
  }

  adminDeleteComment(commentId: number) {
    return this.persistence.adminDeleteComment(commentId);
  }

  getMedia(mediaKey: string, fileName: string) {
    return this.media.getForUser(mediaKey, fileName);
  }

  cleanupOrphanMedia(before: Date) {
    return this.media.cleanupOrphans(before);
  }

  private async cleanupDeletedPostMedia(
    removed: { id: number; mediaKey: string | null } | null,
  ) {
    if (!removed) return null;
    try {
      await this.media.removeStorage(removed.mediaKey);
    } catch (error) {
      Logger.error('TreeholeMedia', `帖子 ${removed.id} 删除后清理图片失败`, error);
    }
    return { id: removed.id };
  }

  private async attemptActivityProjection(): Promise<void> {
    try {
      await this.activityProjection.attempt();
    } catch (error: any) {
      Logger.warn('TreeholeActivity', '提交后活动通知投影失败，等待周期重试', error?.message || String(error));
    }
  }
}
