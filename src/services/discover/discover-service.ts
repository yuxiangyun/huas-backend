/**
 * [INPUT]: 依赖 discover-user-service 的用户业务能力与 discover-admin-service 的管理删除能力
 * [OUTPUT]: 对外提供 DiscoverService 兼容门面，保持既有路由调用入口稳定
 * [POS]: services/discover 的 API 门面，隔离路由层与用户/管理服务拆分细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { DiscoverAdminService } from './discover-admin-service';
import { DiscoverUserService } from './discover-user-service';

// Backward-compatible facade: keeps existing call sites stable
// while separating user/admin responsibilities.
export class DiscoverService {
  static getMeta() {
    return DiscoverUserService.getMeta();
  }

  static async createPost(input: {
    userId: number;
    title?: string;
    storeName?: string;
    priceText?: string;
    content?: string;
    category: string;
    tags: string[];
    images: File[];
  }) {
    return DiscoverUserService.createPost(input);
  }

  static async getPostDetail(userId: number, postId: number) {
    return DiscoverUserService.getPostDetail(userId, postId);
  }

  static async listPosts(
    sort: 'latest' | 'score' | 'recommended',
    options: { userId: number; category?: string; page?: number; pageSize?: number }
  ) {
    return DiscoverUserService.listPosts(sort, options);
  }

  static async listMyPosts(options: { userId: number; category?: string; page?: number; pageSize?: number }) {
    return DiscoverUserService.listMyPosts(options);
  }

  static async ratePost(userId: number, postId: number, score: number) {
    return DiscoverUserService.ratePost(userId, postId, score);
  }

  static async listComments(userId: number, postId: number, options: { page?: number; pageSize?: number }) {
    return DiscoverUserService.listComments(userId, postId, options);
  }

  static async createComment(input: { userId: number; postId: number; content: string; parentCommentId?: number | null }) {
    return DiscoverUserService.createComment(input);
  }

  static async deleteComment(commentId: number, userId: number) {
    return DiscoverUserService.deleteComment(commentId, userId);
  }

  static async deletePost(postId: number, userId: number) {
    return DiscoverUserService.deletePost(postId, userId);
  }

  static async adminDeletePost(postId: number) {
    return DiscoverAdminService.deletePost(postId);
  }
}
