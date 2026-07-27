/**
 * [INPUT]: 依赖 DiscoverApplicationService、SQLite persistence adapter、媒体 adapter 与运行时配置
 * [OUTPUT]: 对外提供完成依赖装配的 Discover 静态兼容类及 canonical application 实例
 * [POS]: modules/discover 的 composition root，是 application ports 与 infrastructure adapters 的唯一连接点
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../config';
import { DiscoverApplicationService } from './application/discover-application-service';
import type { CreateDiscoverCommentInput, CreatePostInput, DiscoverSort, ListOptions } from './domain/discover';
import { DiscoverMediaService } from './infrastructure/discover-media-service';
import { SQLiteDiscoverPersistence } from './infrastructure/sqlite-discover-persistence';

const discoverPolicy = {
  maxImagesPerPost: config.discover.maxImagesPerPost,
  maxTagsPerPost: config.discover.maxTagsPerPost,
  maxTitleLength: config.discover.maxTitleLength,
  maxTagLength: config.discover.maxTagLength,
  maxStoreNameLength: config.discover.maxStoreNameLength,
  maxPriceTextLength: config.discover.maxPriceTextLength,
  maxContentLength: config.discover.maxContentLength,
  maxCommentLength: config.discover.maxCommentLength,
  defaultCommentPageSize: config.discover.defaultCommentPageSize,
  maxCommentPageSize: config.discover.maxCommentPageSize,
};

export const discoverApplicationService = new DiscoverApplicationService(
  new SQLiteDiscoverPersistence(),
  new DiscoverMediaService(),
  discoverPolicy,
);

export class DiscoverUserService {
  static getMeta() { return discoverApplicationService.getMeta(); }
  static createPost(input: CreatePostInput) { return discoverApplicationService.createPost(input); }
  static getPostDetail(userId: number, postId: number) { return discoverApplicationService.getPostDetail(userId, postId); }
  static listPosts(sort: DiscoverSort, options: ListOptions) { return discoverApplicationService.listPosts(sort, options); }
  static listMyPosts(options: ListOptions) { return discoverApplicationService.listMyPosts(options); }
  static ratePost(userId: number, postId: number, score: number) { return discoverApplicationService.ratePost(userId, postId, score); }
  static listComments(userId: number, postId: number, options: { page?: number; pageSize?: number }) {
    return discoverApplicationService.listComments(userId, postId, options);
  }
  static createComment(input: CreateDiscoverCommentInput) { return discoverApplicationService.createComment(input); }
  static deleteComment(commentId: number, userId: number) { return discoverApplicationService.deleteComment(commentId, userId); }
  static deletePost(postId: number, userId: number) { return discoverApplicationService.deletePost(postId, userId); }
}

export class DiscoverService extends DiscoverUserService {
  static adminDeletePost(postId: number) { return discoverApplicationService.deletePost(postId); }
}

export class DiscoverPostService {
  static create(input: CreatePostInput) { return discoverApplicationService.createPost(input); }
  static getDetail(userId: number, postId: number) { return discoverApplicationService.getPostDetail(userId, postId); }
  static list(sort: Exclude<DiscoverSort, 'recommended'>, options: ListOptions) {
    return discoverApplicationService.listPosts(sort, options);
  }
  static listMine(options: ListOptions) { return discoverApplicationService.listMyPosts(options); }
  static rate(userId: number, postId: number, score: number) { return discoverApplicationService.ratePost(userId, postId, score); }
  static delete(postId: number, userId: number) { return discoverApplicationService.deletePost(postId, userId); }
}

export class DiscoverCommentService {
  static list(userId: number, postId: number, options: { page?: number; pageSize?: number }) {
    return discoverApplicationService.listComments(userId, postId, options);
  }
  static create(input: CreateDiscoverCommentInput) { return discoverApplicationService.createComment(input); }
  static delete(commentId: number, userId: number) { return discoverApplicationService.deleteComment(commentId, userId); }
}

export class DiscoverRecommendationService {
  static list(options: ListOptions) { return discoverApplicationService.listPosts('recommended', options); }
}

export class DiscoverAdminService {
  static deletePost(postId: number) { return discoverApplicationService.deletePost(postId); }
}
