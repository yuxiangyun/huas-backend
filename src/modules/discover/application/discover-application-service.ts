/**
 * [INPUT]: 依赖 Discover domain 规则与 persistence/media ports，通过构造函数注入外部实现
 * [OUTPUT]: 对外提供 DiscoverApplicationService，编排帖子、评分、评论、推荐与媒体补偿用例
 * [POS]: modules/discover/application 的唯一用例服务，不知道 Hono、Drizzle、Bun 或文件系统实现
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

export class DiscoverApplicationService {
  constructor(
    private readonly persistence: DiscoverPersistence,
    private readonly media: DiscoverMediaStorage,
    private readonly policy: DiscoverPolicy,
  ) {}

  getMeta() {
    return getDiscoverMeta(this.policy);
  }

  async createPost(input: CreatePostInput) {
    const normalized = normalizePostInput(input, this.policy);
    validateImages(input.images, this.policy);
    const media = await this.media.storeImages(input.images);
    try {
      const postId = await this.persistence.createPost({ ...normalized, media });
      return this.persistence.getPostDetail(input.userId, postId);
    } catch (error) {
      await this.media.removeStorage(media.storageKey);
      throw error;
    }
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
    return this.persistence.listMyPosts(options);
  }

  ratePost(userId: number, postId: number, score: number) {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new AppError(ErrorCode.PARAM_ERROR, '评分必须是 1 到 5 的整数');
    }
    return this.persistence.ratePost(userId, postId, score);
  }

  listComments(userId: number, postId: number, options: { page?: number; pageSize?: number }) {
    return this.persistence.listComments(userId, postId, options);
  }

  createComment(input: CreateDiscoverCommentInput) {
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
}
