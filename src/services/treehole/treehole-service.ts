import { TreeholeAdminService } from './treehole-admin-service';
import { TreeholeUserService } from './treehole-user-service';

// Backward-compatible facade: keep the original API surface stable
// while splitting user/admin responsibilities into dedicated services.
export class TreeholeService {
  static getMeta() {
    return TreeholeUserService.getMeta();
  }

  static async listPosts(options: { userId: number; page?: number; pageSize?: number }) {
    return TreeholeUserService.listPosts(options);
  }

  static async listMyPosts(options: { userId: number; page?: number; pageSize?: number }) {
    return TreeholeUserService.listMyPosts(options);
  }

  static async createPost(input: { userId: number; content: string }) {
    return TreeholeUserService.createPost(input);
  }

  static async getPostDetail(userId: number, postId: number) {
    return TreeholeUserService.getPostDetail(userId, postId);
  }

  static async likePost(userId: number, postId: number) {
    return TreeholeUserService.likePost(userId, postId);
  }

  static async unlikePost(userId: number, postId: number) {
    return TreeholeUserService.unlikePost(userId, postId);
  }

  static async listComments(userId: number, postId: number, options: { page?: number; pageSize?: number }) {
    return TreeholeUserService.listComments(userId, postId, options);
  }

  static async createComment(input: { userId: number; postId: number; content: string }) {
    return TreeholeUserService.createComment(input);
  }

  static async deletePost(postId: number, userId: number) {
    return TreeholeUserService.deletePost(postId, userId);
  }

  static async deleteComment(commentId: number, userId: number) {
    return TreeholeUserService.deleteComment(commentId, userId);
  }

  static async adminListPosts(options: { page?: number; pageSize?: number; keyword?: string }) {
    return TreeholeAdminService.listPosts(options);
  }

  static async adminListComments(postId: number, options: { page?: number; pageSize?: number }) {
    return TreeholeAdminService.listComments(postId, options);
  }

  static async adminDeletePost(postId: number) {
    return TreeholeAdminService.deletePost(postId);
  }

  static async adminDeleteComment(commentId: number) {
    return TreeholeAdminService.deleteComment(commentId);
  }
}
