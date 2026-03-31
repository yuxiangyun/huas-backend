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
