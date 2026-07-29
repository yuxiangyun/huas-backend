/**
 * [INPUT]: 依赖 TreeholePersistence port、Drizzle 社区资料可见性查询及用户/管理 SQLite adapter
 * [OUTPUT]: 对外提供完整实现 TreeholePersistence 的 SQLiteTreeholePersistence
 * [POS]: modules/treehole/infrastructure 的聚合持久化 adapter，向 application 隐藏 SQL 职责拆分
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import type { TreeholePersistence } from '../domain/ports';
import type {
  AdminTreeholeCommentListOptions,
  AdminTreeholePostListOptions,
  PersistTreeholeCommentInput,
} from '../domain/treehole';
import { SQLiteTreeholeAdminPersistence } from './sqlite-treehole-admin-persistence';
import { SQLiteTreeholeUserPersistence } from './sqlite-treehole-user-persistence';

export class SQLiteTreeholePersistence implements TreeholePersistence {
  private readonly user = new SQLiteTreeholeUserPersistence();
  private readonly admin = new SQLiteTreeholeAdminPersistence();

  getAvatar(userId: number) { return this.user.getAvatar(userId); }
  getCommunityProfile(userId: number) { return this.user.getCommunityProfile(userId); }
  setAvatarUrl(userId: number, avatarUrl: string | null) { return this.user.setAvatarUrl(userId, avatarUrl); }
  setCommunityProfile(userId: number, profile: { nickname: string | null; avatarUrl?: string }) {
    return this.user.setCommunityProfile(userId, profile);
  }
  getUnreadNotificationCount(userId: number) { return this.user.getUnreadNotificationCount(userId); }
  markAllNotificationsRead(userId: number) { return this.user.markAllNotificationsRead(userId); }
  listPosts(options: { userId: number; page: number; pageSize: number }) { return this.user.listPosts(options); }
  listMyPosts(options: { userId: number; page: number; pageSize: number }) { return this.user.listMyPosts(options); }
  createPost(input: { userId: number; content: string }) { return this.user.createPost(input); }
  getPostDetail(userId: number, postId: number) { return this.user.getPostDetail(userId, postId); }
  likePost(userId: number, postId: number) { return this.user.likePost(userId, postId); }
  unlikePost(userId: number, postId: number) { return this.user.unlikePost(userId, postId); }
  listComments(userId: number, postId: number, options: { page: number; pageSize: number }) {
    return this.user.listComments(userId, postId, options);
  }
  createComment(input: PersistTreeholeCommentInput) { return this.user.createComment(input); }
  deletePost(postId: number, userId: number) { return this.user.deletePost(postId, userId); }
  deleteComment(commentId: number, userId: number) { return this.user.deleteComment(commentId, userId); }
  adminListPosts(options: AdminTreeholePostListOptions & { page: number; pageSize: number }) {
    return this.admin.listPosts(options);
  }
  adminListComments(
    postId: number,
    options: AdminTreeholeCommentListOptions & { page: number; pageSize: number },
  ) {
    return this.admin.listComments(postId, options);
  }
  adminDeletePost(postId: number) { return this.admin.deletePost(postId); }
  adminDeleteComment(commentId: number) { return this.admin.deleteComment(commentId); }

  async isPublishedAvatar(userId: number, publicPath: string) {
    const db = getDb();
    const rows = await db.select({ avatarUrl: schema.users.treeholeAvatarUrl })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return (rows[0]?.avatarUrl?.split('?')[0] || '') === publicPath;
  }
}
