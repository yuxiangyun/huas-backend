/**
 * [INPUT]: 依赖构造注入的 Drizzle db、CommunityProfileReader、TreeholeMediaReader、ActivityOutboxWriter 与用户/管理 SQLite adapters
 * [OUTPUT]: 对外提供完整实现含图片元数据 TreeholePersistence 的 SQLiteTreeholePersistence
 * [POS]: modules/treehole/infrastructure 的聚合 adapter，向 application 隐藏事实查询、媒体 URL 与公共作者投影拆分
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfileReader } from '../../community/domain/ports';
import type { ActivityOutboxWriter } from '../../notifications/domain/ports';
import type { TreeholeMediaReader, TreeholePersistence } from '../domain/ports';
import type {
  AdminTreeholeCommentListOptions,
  AdminTreeholePostListOptions,
  PersistTreeholeCommentInput,
  StoredTreeholeMedia,
} from '../domain/treehole';
import { SQLiteTreeholeAdminPersistence } from './sqlite-treehole-admin-persistence';
import type { TreeholeDatabase, TreeholeTransaction } from './sqlite-treehole-support';
import { SQLiteTreeholeUserPersistence } from './sqlite-treehole-user-persistence';

export class SQLiteTreeholePersistence implements TreeholePersistence {
  private readonly user: SQLiteTreeholeUserPersistence;
  private readonly admin: SQLiteTreeholeAdminPersistence;

  constructor(
    db: TreeholeDatabase,
    profiles: CommunityProfileReader,
    media: TreeholeMediaReader,
    outbox: ActivityOutboxWriter<TreeholeTransaction>,
  ) {
    this.user = new SQLiteTreeholeUserPersistence(db, profiles, media, outbox);
    this.admin = new SQLiteTreeholeAdminPersistence(db, profiles, media, outbox);
  }

  listPosts(options: { userId: number; page: number; pageSize: number }) {
    return this.user.listPosts(options);
  }
  listUserPosts(options: {
    viewerUserId: number;
    authorUserId: number;
    page: number;
    pageSize: number;
  }) {
    return this.user.listUserPosts(options);
  }
  createPost(input: { userId: number; content: string; media: StoredTreeholeMedia | null }) {
    return this.user.createPost(input);
  }  getPostDetail(userId: number, postId: number) { return this.user.getPostDetail(userId, postId); }
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
}
