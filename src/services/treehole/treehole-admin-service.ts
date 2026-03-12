import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../../db';
import {
  adminCommentSelect,
  adminPostSelect,
  clampCommentPageSize,
  clampPage,
  clampPageSize,
  formatLikeKeyword,
  refreshPostCommentCount,
  toAdminCommentResponse,
  toAdminPostResponse,
  type AdminTreeholeCommentListOptions,
  type AdminTreeholeCommentListResponse,
  type AdminTreeholeCommentRow,
  type AdminTreeholePostListOptions,
  type AdminTreeholePostListResponse,
  type AdminTreeholePostRow,
} from './treehole-shared';

export class TreeholeAdminService {
  static async listPosts(options: AdminTreeholePostListOptions): Promise<AdminTreeholePostListResponse> {
    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const keyword = options.keyword?.trim() || '';
    const whereParts = [isNull(schema.treeholePosts.deletedAt)];

    if (keyword) {
      const match = formatLikeKeyword(keyword);
      whereParts.push(or(
        like(schema.treeholePosts.content, match),
        like(schema.users.studentId, match),
        like(schema.users.name, match),
        like(schema.users.className, match),
      )!);
    }

    const whereExpr = and(...whereParts);
    const [
      totalRows,
      totalPostRows,
      totalCommentRows,
      totalLikeRows,
      rows,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholePosts)
        .innerJoin(schema.users, eq(schema.treeholePosts.userId, schema.users.id))
        .where(whereExpr),
      db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholePosts)
        .where(isNull(schema.treeholePosts.deletedAt)),
      db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholeComments)
        .innerJoin(schema.treeholePosts, eq(schema.treeholeComments.postId, schema.treeholePosts.id))
        .where(and(
          isNull(schema.treeholeComments.deletedAt),
          isNull(schema.treeholePosts.deletedAt),
        )),
      db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholePostLikes)
        .innerJoin(schema.treeholePosts, eq(schema.treeholePostLikes.postId, schema.treeholePosts.id))
        .where(isNull(schema.treeholePosts.deletedAt)),
      db.select(adminPostSelect())
        .from(schema.treeholePosts)
        .innerJoin(schema.users, eq(schema.treeholePosts.userId, schema.users.id))
        .where(whereExpr)
        .orderBy(desc(schema.treeholePosts.publishedAt), desc(schema.treeholePosts.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    const total = Number(totalRows[0]?.count || 0);

    return {
      summary: {
        totalPosts: Number(totalPostRows[0]?.count || 0),
        totalComments: Number(totalCommentRows[0]?.count || 0),
        totalLikes: Number(totalLikeRows[0]?.count || 0),
      },
      items: (rows as AdminTreeholePostRow[]).map(toAdminPostResponse),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  static async listComments(
    postId: number,
    options: AdminTreeholeCommentListOptions
  ): Promise<AdminTreeholeCommentListResponse | null> {
    const db = getDb();
    const postRows = await db.select({ id: schema.treeholePosts.id })
      .from(schema.treeholePosts)
      .where(and(
        eq(schema.treeholePosts.id, postId),
        isNull(schema.treeholePosts.deletedAt),
      ))
      .limit(1);

    if (!postRows[0]) return null;

    const page = clampPage(options.page);
    const pageSize = clampCommentPageSize(options.pageSize);
    const whereExpr = and(
      eq(schema.treeholeComments.postId, postId),
      isNull(schema.treeholeComments.deletedAt),
    );

    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholeComments)
        .where(whereExpr),
      db.select(adminCommentSelect())
        .from(schema.treeholeComments)
        .innerJoin(schema.users, eq(schema.treeholeComments.userId, schema.users.id))
        .where(whereExpr)
        .orderBy(desc(schema.treeholeComments.createdAt), desc(schema.treeholeComments.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    const total = Number(totalRows[0]?.count || 0);
    return {
      items: (rows as AdminTreeholeCommentRow[]).map(toAdminCommentResponse),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  static async deletePost(postId: number) {
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

  static async deleteComment(commentId: number) {
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
