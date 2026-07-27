/**
 * [INPUT]: 依赖 db/schema、domain 评论规则适配与同层 DiscoverPostQuery
 * [OUTPUT]: 对外提供 DiscoverCommentService，处理评论列表、创建、回复校验、软删除和计数同步
 * [POS]: modules/discover/infrastructure 的 SQLite 评论 adapter，与同层帖子查询协作并保持评论计数原子性
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { AppError, ErrorCode } from '../../../utils/errors';
import { DiscoverPostQuery } from './sqlite-discover-post-service';
import {
  clampCommentPageSize,
  clampPage,
  commentSelect,
  normalizeCommentContent,
  toCommentResponse,
  type CreateDiscoverCommentInput,
  type DiscoverCommentListResponse,
  type DiscoverCommentResponse,
  type DiscoverCommentRow,
} from './discover-mapping';

export class DiscoverCommentService {
  static async list(
    userId: number,
    postId: number,
    options: { page?: number; pageSize?: number },
  ): Promise<DiscoverCommentListResponse | null> {
    if (!await DiscoverPostQuery.findPublicPost(postId)) return null;

    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampCommentPageSize(options.pageSize);
    const whereExpr = and(
      eq(schema.discoverComments.postId, postId),
      isNull(schema.discoverComments.deletedAt),
    );
    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.discoverComments)
      .where(whereExpr);
    const rows = await db.select(commentSelect())
      .from(schema.discoverComments)
      .innerJoin(schema.users, eq(schema.discoverComments.userId, schema.users.id))
      .where(whereExpr)
      .orderBy(asc(schema.discoverComments.createdAt), asc(schema.discoverComments.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const total = Number(totalRows[0]?.count || 0);

    return {
      items: (rows as DiscoverCommentRow[]).map((row) => toCommentResponse(row, userId)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  static async create(input: CreateDiscoverCommentInput): Promise<DiscoverCommentResponse | null> {
    const content = normalizeCommentContent(input.content);
    const parentCommentId = input.parentCommentId ?? null;
    if (parentCommentId !== null && (!Number.isInteger(parentCommentId) || parentCommentId <= 0)) {
      throw new AppError(ErrorCode.PARAM_ERROR, '父评论 ID 不合法');
    }

    const createdCommentId = await getDb().transaction(async (tx) => {
      const postRows = await tx.select({ id: schema.discoverPosts.id })
        .from(schema.discoverPosts)
        .where(and(eq(schema.discoverPosts.id, input.postId), isNull(schema.discoverPosts.deletedAt)))
        .limit(1);
      if (!postRows[0]) return null;

      if (parentCommentId !== null) {
        const parentRows = await tx.select({ id: schema.discoverComments.id })
          .from(schema.discoverComments)
          .where(and(
            eq(schema.discoverComments.id, parentCommentId),
            eq(schema.discoverComments.postId, input.postId),
            isNull(schema.discoverComments.deletedAt),
          ))
          .limit(1);
        if (!parentRows[0]) throw new AppError(ErrorCode.PARAM_ERROR, '回复的评论不存在');
      }

      const now = new Date();
      const inserted = await tx.insert(schema.discoverComments).values({
        postId: input.postId,
        userId: input.userId,
        parentCommentId,
        content,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }).returning({ id: schema.discoverComments.id });
      await this.refreshPostCommentCount(tx, input.postId, now);
      return inserted[0]?.id ?? null;
    });

    if (!createdCommentId) return null;
    const row = await this.findById(createdCommentId);
    return row ? toCommentResponse(row, input.userId) : null;
  }

  static async delete(commentId: number, userId: number) {
    return getDb().transaction(async (tx) => {
      const commentRows = await tx.select({
        id: schema.discoverComments.id,
        postId: schema.discoverComments.postId,
      })
        .from(schema.discoverComments)
        .innerJoin(schema.discoverPosts, eq(schema.discoverComments.postId, schema.discoverPosts.id))
        .where(and(
          eq(schema.discoverComments.id, commentId),
          eq(schema.discoverComments.userId, userId),
          isNull(schema.discoverComments.deletedAt),
          isNull(schema.discoverPosts.deletedAt),
        ))
        .limit(1);
      const activeComment = commentRows[0];
      if (!activeComment) return null;

      const now = new Date();
      const updated = await tx.update(schema.discoverComments)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.discoverComments.id, activeComment.id),
          eq(schema.discoverComments.userId, userId),
          eq(schema.discoverComments.postId, activeComment.postId),
          isNull(schema.discoverComments.deletedAt),
        ))
        .returning({ id: schema.discoverComments.id, postId: schema.discoverComments.postId });
      if (!updated[0]) return null;

      await this.refreshPostCommentCount(tx, updated[0].postId, now);
      return updated[0];
    });
  }

  private static async findById(commentId: number) {
    const rows = await getDb().select(commentSelect())
      .from(schema.discoverComments)
      .innerJoin(schema.users, eq(schema.discoverComments.userId, schema.users.id))
      .where(and(eq(schema.discoverComments.id, commentId), isNull(schema.discoverComments.deletedAt)))
      .limit(1);
    return rows[0] as DiscoverCommentRow | undefined;
  }

  private static async refreshPostCommentCount(tx: any, postId: number, now: Date) {
    const countRows = await tx.select({ count: sql<number>`count(*)` })
      .from(schema.discoverComments)
      .where(and(eq(schema.discoverComments.postId, postId), isNull(schema.discoverComments.deletedAt)));
    await tx.update(schema.discoverPosts)
      .set({ commentCount: Number(countRows[0]?.count || 0), updatedAt: now })
      .where(eq(schema.discoverPosts.id, postId));
  }
}
