import { and, asc, desc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '../../db';
import { AppError, ErrorCode } from '../../utils/errors';
import {
  clampCommentPageSize,
  clampPage,
  clampPageSize,
  commentSelect,
  type CreateTreeholeCommentInput,
  type CreateTreeholePostInput,
  findPublicPost,
  getLikedMap,
  getTreeholeAvatarMap,
  getTreeholeMeta,
  normalizeCommentContent,
  normalizePostContent,
  postSelect,
  refreshPostCommentCount,
  refreshPostLikeCount,
  toCommentResponse,
  toPostListResponse,
  toPostResponse,
  type TreeholeCommentListResponse,
  type TreeholeCommentRow,
  type TreeholeAvatarResponse,
  type TreeholeNotificationType,
  type TreeholeListResponse,
  type TreeholePostResponse,
  type TreeholePostRow,
  type TreeholeReadAllNotificationsResponse,
  type TreeholeUnreadNotificationCountResponse,
} from './treehole-shared';
import { TreeholeAvatarMediaService } from './treehole-avatar-media-service';

export class TreeholeUserService {
  static getMeta() {
    return getTreeholeMeta();
  }

  static async getAvatar(userId: number): Promise<TreeholeAvatarResponse> {
    const db = getDb();
    const rows = await db.select({
      avatarUrl: schema.users.treeholeAvatarUrl,
    })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    return {
      avatarUrl: rows[0]?.avatarUrl || null,
    };
  }

  static async updateAvatar(userId: number, file: File): Promise<TreeholeAvatarResponse> {
    const avatarUrl = await TreeholeAvatarMediaService.uploadAvatar(userId, file);
    const db = getDb();
    await db.update(schema.users)
      .set({ treeholeAvatarUrl: avatarUrl })
      .where(eq(schema.users.id, userId));
    return { avatarUrl };
  }

  static async clearAvatar(userId: number): Promise<TreeholeAvatarResponse> {
    await TreeholeAvatarMediaService.removeAvatar(userId);
    const db = getDb();
    await db.update(schema.users)
      .set({ treeholeAvatarUrl: null })
      .where(eq(schema.users.id, userId));
    return { avatarUrl: null };
  }

  static async getUnreadNotificationCount(userId: number): Promise<TreeholeUnreadNotificationCountResponse> {
    const db = getDb();
    const rows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.treeholeCommentNotifications)
      .where(and(
        eq(schema.treeholeCommentNotifications.recipientUserId, userId),
        isNull(schema.treeholeCommentNotifications.readAt),
      ));

    return { unreadCount: Number(rows[0]?.count || 0) };
  }

  static async markAllNotificationsRead(userId: number): Promise<TreeholeReadAllNotificationsResponse> {
    const db = getDb();
    const now = new Date();
    const pruneBefore = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const updated = await db.update(schema.treeholeCommentNotifications)
      .set({ readAt: now })
      .where(and(
        eq(schema.treeholeCommentNotifications.recipientUserId, userId),
        isNull(schema.treeholeCommentNotifications.readAt),
      ))
      .returning({ id: schema.treeholeCommentNotifications.id });

    await db.delete(schema.treeholeCommentNotifications)
      .where(and(
        eq(schema.treeholeCommentNotifications.recipientUserId, userId),
        isNotNull(schema.treeholeCommentNotifications.readAt),
        lt(schema.treeholeCommentNotifications.readAt, pruneBefore),
      ));

    return { readCount: updated.length };
  }

  static async listPosts(options: { userId: number; page?: number; pageSize?: number }): Promise<TreeholeListResponse> {
    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const whereExpr = isNull(schema.treeholePosts.deletedAt);
    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.treeholePosts)
      .where(whereExpr);
    const total = Number(totalRows[0]?.count || 0);
    const rows = await db.select(postSelect())
      .from(schema.treeholePosts)
      .where(whereExpr)
      .orderBy(desc(schema.treeholePosts.publishedAt), desc(schema.treeholePosts.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return toPostListResponse(rows as TreeholePostRow[], options.userId, page, pageSize, total);
  }

  static async listMyPosts(options: { userId: number; page?: number; pageSize?: number }): Promise<TreeholeListResponse> {
    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const whereExpr = and(
      eq(schema.treeholePosts.userId, options.userId),
      isNull(schema.treeholePosts.deletedAt),
    );
    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.treeholePosts)
      .where(whereExpr);
    const total = Number(totalRows[0]?.count || 0);
    const rows = await db.select(postSelect())
      .from(schema.treeholePosts)
      .where(whereExpr)
      .orderBy(desc(schema.treeholePosts.publishedAt), desc(schema.treeholePosts.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return toPostListResponse(rows as TreeholePostRow[], options.userId, page, pageSize, total);
  }

  static async createPost(input: CreateTreeholePostInput): Promise<TreeholePostResponse | null> {
    const content = normalizePostContent(input.content);
    const db = getDb();
    const now = new Date();
    const inserted = await db.insert(schema.treeholePosts).values({
      userId: input.userId,
      content,
      likeCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      deletedAt: null,
    }).returning({ id: schema.treeholePosts.id });

    return this.getPostDetail(input.userId, inserted[0].id);
  }

  static async getPostDetail(userId: number, postId: number): Promise<TreeholePostResponse | null> {
    const row = await findPublicPost(postId);
    if (!row) return null;

    const likedMap = await getLikedMap(userId, [postId]);
    const avatarMap = await getTreeholeAvatarMap([row.userId]);
    return toPostResponse(row, userId, likedMap.has(postId), avatarMap.get(row.userId) || null);
  }

  static async likePost(userId: number, postId: number): Promise<TreeholePostResponse | null> {
    const db = getDb();
    const exists = await db.transaction(async (tx) => {
      const rows = await tx.select({ id: schema.treeholePosts.id })
        .from(schema.treeholePosts)
        .where(and(
          eq(schema.treeholePosts.id, postId),
          isNull(schema.treeholePosts.deletedAt),
        ))
        .limit(1);

      if (!rows[0]) return false;

      const now = new Date();
      await tx.insert(schema.treeholePostLikes).values({
        postId,
        userId,
        createdAt: now,
      }).onConflictDoNothing();

      await refreshPostLikeCount(tx, postId, now);
      return true;
    });

    if (!exists) return null;
    return this.getPostDetail(userId, postId);
  }

  static async unlikePost(userId: number, postId: number): Promise<TreeholePostResponse | null> {
    const db = getDb();
    const exists = await db.transaction(async (tx) => {
      const rows = await tx.select({ id: schema.treeholePosts.id })
        .from(schema.treeholePosts)
        .where(and(
          eq(schema.treeholePosts.id, postId),
          isNull(schema.treeholePosts.deletedAt),
        ))
        .limit(1);

      if (!rows[0]) return false;

      const now = new Date();
      await tx.delete(schema.treeholePostLikes).where(and(
        eq(schema.treeholePostLikes.postId, postId),
        eq(schema.treeholePostLikes.userId, userId),
      ));

      await refreshPostLikeCount(tx, postId, now);
      return true;
    });

    if (!exists) return null;
    return this.getPostDetail(userId, postId);
  }

  static async listComments(
    userId: number,
    postId: number,
    options: { page?: number; pageSize?: number }
  ): Promise<TreeholeCommentListResponse | null> {
    const post = await findPublicPost(postId);
    if (!post) return null;

    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampCommentPageSize(options.pageSize);
    const whereExpr = and(
      eq(schema.treeholeComments.postId, postId),
      isNull(schema.treeholeComments.deletedAt),
    );
    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.treeholeComments)
      .where(whereExpr);
    const total = Number(totalRows[0]?.count || 0);
    const rows = await db.select(commentSelect())
      .from(schema.treeholeComments)
      .where(whereExpr)
      .orderBy(asc(schema.treeholeComments.createdAt), asc(schema.treeholeComments.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const typedRows = rows as TreeholeCommentRow[];
    const avatarMap = await getTreeholeAvatarMap(typedRows.map((row) => row.userId));

    return {
      items: typedRows.map((row) => toCommentResponse(row, userId, avatarMap.get(row.userId) || null)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  static async createComment(input: CreateTreeholeCommentInput) {
    const content = normalizeCommentContent(input.content);
    const parentCommentId = input.parentCommentId ?? null;
    if (parentCommentId !== null && (!Number.isInteger(parentCommentId) || parentCommentId <= 0)) {
      throw new AppError(ErrorCode.PARAM_ERROR, '父评论 ID 不合法');
    }

    const db = getDb();
    const created = await db.transaction(async (tx) => {
      const postRows = await tx.select({
        id: schema.treeholePosts.id,
        userId: schema.treeholePosts.userId,
      })
        .from(schema.treeholePosts)
        .where(and(
          eq(schema.treeholePosts.id, input.postId),
          isNull(schema.treeholePosts.deletedAt),
        ))
        .limit(1);

      if (!postRows[0]) return null;

      let parentCommentUserId: number | null = null;
      if (parentCommentId !== null) {
        const parentRows = await tx.select({
          id: schema.treeholeComments.id,
          userId: schema.treeholeComments.userId,
        })
          .from(schema.treeholeComments)
          .where(and(
            eq(schema.treeholeComments.id, parentCommentId),
            eq(schema.treeholeComments.postId, input.postId),
            isNull(schema.treeholeComments.deletedAt),
          ))
          .limit(1);

        if (!parentRows[0]) {
          throw new AppError(ErrorCode.PARAM_ERROR, '回复的评论不存在');
        }

        parentCommentUserId = parentRows[0].userId;
      }

      const now = new Date();
      const inserted = await tx.insert(schema.treeholeComments).values({
        postId: input.postId,
        userId: input.userId,
        parentCommentId,
        content,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }).returning(commentSelect());

      await refreshPostCommentCount(tx, input.postId, now);

      const recipientTypeMap = new Map<number, TreeholeNotificationType>();
      if (postRows[0].userId !== input.userId) {
        recipientTypeMap.set(postRows[0].userId, 'post_comment');
      }
      if (parentCommentUserId !== null && parentCommentUserId !== input.userId) {
        recipientTypeMap.set(parentCommentUserId, 'comment_reply');
      }

      const notificationValues = Array.from(recipientTypeMap.entries()).map(([recipientUserId, type]) => ({
        recipientUserId,
        actorUserId: input.userId,
        postId: input.postId,
        commentId: inserted[0].id,
        type,
        readAt: null,
        createdAt: now,
      }));

      if (notificationValues.length > 0) {
        await tx.insert(schema.treeholeCommentNotifications).values(notificationValues);
      }

      return inserted[0] as TreeholeCommentRow;
    });

    if (!created) return null;
    const avatarMap = await getTreeholeAvatarMap([created.userId]);
    return toCommentResponse(created, input.userId, avatarMap.get(created.userId) || null);
  }

  static async deletePost(postId: number, userId: number) {
    const db = getDb();
    return db.transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.update(schema.treeholePosts)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(schema.treeholePosts.id, postId),
          eq(schema.treeholePosts.userId, userId),
          isNull(schema.treeholePosts.deletedAt),
        ))
        .returning({ id: schema.treeholePosts.id });

      if (!updated[0]) return null;

      await tx.update(schema.treeholeCommentNotifications)
        .set({ readAt: now })
        .where(and(
          eq(schema.treeholeCommentNotifications.postId, postId),
          isNull(schema.treeholeCommentNotifications.readAt),
        ));

      return { id: updated[0].id };
    });
  }

  static async deleteComment(commentId: number, userId: number) {
    const db = getDb();
    return db.transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.update(schema.treeholeComments)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(schema.treeholeComments.id, commentId),
          eq(schema.treeholeComments.userId, userId),
          isNull(schema.treeholeComments.deletedAt),
        ))
        .returning({
          id: schema.treeholeComments.id,
          postId: schema.treeholeComments.postId,
        });

      if (!updated[0]) return null;

      await refreshPostCommentCount(tx, updated[0].postId, now);
      await tx.update(schema.treeholeCommentNotifications)
        .set({ readAt: now })
        .where(and(
          eq(schema.treeholeCommentNotifications.commentId, updated[0].id),
          isNull(schema.treeholeCommentNotifications.readAt),
        ));

      return updated[0];
    });
  }
}
