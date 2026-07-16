/**
 * [INPUT]: 依赖帖子、评论、推荐服务组件与 discover-shared 的元数据/公开类型
 * [OUTPUT]: 对外提供 DiscoverUserService 稳定用户门面与兼容类型再导出
 * [POS]: services/discover 的用户用例聚合器，只路由职责，不直接持有数据库与媒体实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { DiscoverCommentService } from './discover-comment-service';
import { DiscoverPostService } from './discover-post-service';
import { DiscoverRecommendationService } from './discover-recommendation-service';
import {
  getDiscoverMeta,
  type CreateDiscoverCommentInput,
  type CreatePostInput,
  type DiscoverSort,
  type ListOptions,
} from './discover-shared';

export type {
  CreateDiscoverCommentInput,
  CreatePostInput,
  DiscoverCommentListResponse,
  DiscoverCommentResponse,
  DiscoverListResponse,
  DiscoverPostResponse,
  DiscoverSort,
  ListOptions,
} from './discover-shared';

export class DiscoverUserService {
  static getMeta() {
    return getDiscoverMeta();
  }

  static createPost(input: CreatePostInput) {
    return DiscoverPostService.create(input);
  }

  static getPostDetail(userId: number, postId: number) {
    return DiscoverPostService.getDetail(userId, postId);
  }

  static listPosts(sort: DiscoverSort, options: ListOptions) {
    return sort === 'recommended'
      ? DiscoverRecommendationService.list(options)
      : DiscoverPostService.list(sort, options);
  }

  static listMyPosts(options: ListOptions) {
    return DiscoverPostService.listMine(options);
  }

  static ratePost(userId: number, postId: number, score: number) {
    return DiscoverPostService.rate(userId, postId, score);
  }

  static listComments(userId: number, postId: number, options: { page?: number; pageSize?: number }) {
    return DiscoverCommentService.list(userId, postId, options);
  }

  static createComment(input: CreateDiscoverCommentInput) {
    return DiscoverCommentService.create(input);
  }

  static deleteComment(commentId: number, userId: number) {
    return DiscoverCommentService.delete(commentId, userId);
  }

  static deletePost(postId: number, userId: number) {
    return DiscoverPostService.delete(postId, userId);
  }
}
