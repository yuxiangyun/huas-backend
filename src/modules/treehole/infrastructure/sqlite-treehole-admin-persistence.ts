/**
 * [INPUT]: 依赖 Drizzle db/schema、Treehole domain 的管理 DTO 与模块内 SQLite 支撑函数
 * [OUTPUT]: 对 SQLiteTreeholePersistence 提供真实作者管理查询及软删除完整事务
 * [POS]: modules/treehole/infrastructure 的管理侧 SQLite adapter，与匿名前台响应严格分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import {
  formatLikeKeyword,
  toAdminCommentResponse,
  toAdminPostResponse,
  type AdminTreeholeCommentListOptions,
  type AdminTreeholeCommentListResponse,
  type AdminTreeholeCommentRow,
  type AdminTreeholePostListOptions,
  type AdminTreeholePostListResponse,
  type AdminTreeholePostRow,
} from '../domain/treehole';
import {
  adminCommentSelect,
  adminPostSelect,
  refreshPostCommentCount,
} from './sqlite-treehole-support';

export class SQLiteTreeholeAdminPersistence {
  async listPosts(
    options: AdminTreeholePostListOptions & { page: number; pageSize: number },
  ): Promise<AdminTreeholePostListResponse> {
    const db = getDb();
    const { page, pageSize } = options;
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

  async listComments(
    postId: number,
    options: AdminTreeholeCommentListOptions & { page: number; pageSize: number },
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

    const { page, pageSize } = options;
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

  async deletePost(postId: number) {
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

  async deleteComment(commentId: number) {
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
