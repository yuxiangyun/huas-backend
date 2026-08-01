/**
 * [INPUT]: 依赖 Discover domain 规则、构造注入的 persistence/media ports 与 Notifications 提交后投影触发器
 * [OUTPUT]: 对外提供 DiscoverApplicationService，编排帖子、点赞、评论、推荐、用户帖子、活动投影、媒体补偿与孤儿回收用例
 * [POS]: modules/discover/application 的唯一用例服务，不知道 Hono、Drizzle、Community/Notifications 实现或文件系统
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';
import {
  getDiscoverMeta,
  normalizeCommentContent,
  normalizePostInput,
  validateImages,
  type CreateDiscoverCommentInput,
  type CreatePostInput,
  type DiscoverPolicy,
  type DiscoverSort,
  type ListOptions,
} from '../domain/discover';
import type { DiscoverMediaStorage, DiscoverPersistence } from '../domain/ports';
import type { ActivityProjectionTrigger } from '../../notifications/domain/ports';

export class DiscoverApplicationService {
  constructor(
    private readonly persistence: DiscoverPersistence,
    private readonly media: DiscoverMediaStorage,
    private readonly policy: DiscoverPolicy,
    private readonly activityProjection: ActivityProjectionTrigger,
  ) {}

  getMeta() {
    return getDiscoverMeta(this.policy);
  }

  async createPost(input: CreatePostInput) {
    const normalized = normalizePostInput(input, this.policy);
    validateImages(input.images, this.policy);
    const media = await this.media.storeImages(input.images);
    let postId: number;
    try {
      postId = await this.persistence.createPost({ ...normalized, media });
    } catch (error) {
      try {
        await this.media.removeStorage(media.storageKey);
      } catch (cleanupError: any) {
        Logger.error('DiscoverService', '帖子写库失败后的媒体补偿也失败', cleanupError);
      }
      throw error;
    }
    return this.persistence.getPostDetail(input.userId, postId);
  }

  getPostDetail(userId: number, postId: number) {
    return this.persistence.getPostDetail(userId, postId);
  }

  listPosts(sort: DiscoverSort, options: ListOptions) {
    return sort === 'recommended'
      ? this.persistence.listRecommendedPosts(options)
      : this.persistence.listPosts(sort, options);
  }

  listMyPosts(options: ListOptions) {
    return this.persistence.listUserPosts(options.userId, options);
  }

  listUserPosts(viewerUserId: number, targetUserId: number, options: Omit<ListOptions, 'userId'>) {
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '用户 ID 不合法');
    }
    return this.persistence.listUserPosts(targetUserId, { ...options, userId: viewerUserId });
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
    return this.persistence.listComments(userId, postId, options);
  }

  async createComment(input: CreateDiscoverCommentInput) {
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

  deleteComment(commentId: number, userId: number) {
    return this.persistence.deleteComment(commentId, userId);
  }

  async deletePost(postId: number, userId?: number) {
    const removed = await this.persistence.deletePost(postId, userId);
    if (!removed) return null;
    try {
      await this.media.removeStorage(removed.storageKey);
    } catch (error: any) {
      Logger.error('DiscoverService', `帖子 ${removed.id} 删除后清理图片失败`, error);
    }
    return { id: removed.id };
  }

  cleanupOrphanMedia(before: Date) {
    return this.media.cleanupOrphans(before);
  }

  private async attemptActivityProjection(): Promise<void> {
    try {
      await this.activityProjection.attempt();
    } catch (error: any) {
      Logger.warn('DiscoverActivity', '提交后活动通知投影失败，等待周期重试', error?.message || String(error));
    }
  }
}
