/**
 * [INPUT]: 依赖 db/schema、SQLite 行映射与 Discover 领域 DTO
 * [OUTPUT]: 对外提供 SQLite 帖子查询/列表/评分实现与 infrastructure 内部 DiscoverPostQuery
 * [POS]: modules/discover/infrastructure 的 SQLite 帖子 adapter，查询组件只供同层评论与推荐实现复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { AppError, ErrorCode } from '../../../utils/errors';
import {
  clampPage,
  clampPageSize,
  normalizeCategory,
  postSelect,
  roundRating,
  toPostResponse,
  type DiscoverListResponse,
  type DiscoverPostResponse,
  type DiscoverRow,
  type DiscoverSort,
  type ListOptions,
} from './discover-mapping';

export const DiscoverPostQuery = {
  async findPublicPost(postId: number) {
    const rows = await getDb().select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .where(and(
        eq(schema.discoverPosts.id, postId),
        isNull(schema.discoverPosts.deletedAt),
      ))
      .limit(1);
    return rows[0] as DiscoverRow | undefined;
  },

  async getUserScoreMap(userId: number, postIds: number[]) {
    if (postIds.length === 0) return new Map<number, number>();
    const rows = await getDb().select({
      postId: schema.discoverPostRatings.postId,
      score: schema.discoverPostRatings.score,
    })
      .from(schema.discoverPostRatings)
      .where(and(
        eq(schema.discoverPostRatings.userId, userId),
        inArray(schema.discoverPostRatings.postId, postIds),
      ));
    return new Map(rows.map((row) => [row.postId, row.score]));
  },

  async toPagedResponse(
    rows: DiscoverRow[],
    userId: number,
    page: number,
    pageSize: number,
    total: number,
  ): Promise<DiscoverListResponse> {
    const userScores = await this.getUserScoreMap(userId, rows.map((row) => row.id));
    return {
      items: rows.map((row) => toPostResponse(row, userId, userScores.get(row.id) ?? null)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  },
};

export class DiscoverPostService {
  static async getDetail(userId: number, postId: number): Promise<DiscoverPostResponse | null> {
    const row = await DiscoverPostQuery.findPublicPost(postId);
    if (!row) return null;
    const userScores = await DiscoverPostQuery.getUserScoreMap(userId, [postId]);
    return toPostResponse(row, userId, userScores.get(postId) ?? null);
  }

  static async list(sort: Exclude<DiscoverSort, 'recommended'>, options: ListOptions): Promise<DiscoverListResponse> {
    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const whereExpr = this.listWhere(options.category);
    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.discoverPosts)
      .where(whereExpr);
    const orderBy = sort === 'score'
      ? [desc(schema.discoverPosts.ratingAvg), desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id)] as const
      : [desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id)] as const;
    const rows = await db.select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .where(whereExpr)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return DiscoverPostQuery.toPagedResponse(
      rows as DiscoverRow[],
      options.userId,
      page,
      pageSize,
      Number(totalRows[0]?.count || 0),
    );
  }

  static async listMine(options: ListOptions): Promise<DiscoverListResponse> {
    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const filters = [eq(schema.discoverPosts.userId, options.userId), isNull(schema.discoverPosts.deletedAt)];
    if (options.category) filters.push(eq(schema.discoverPosts.category, normalizeCategory(options.category)));
    const whereExpr = and(...filters);
    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.discoverPosts)
      .where(whereExpr);
    const rows = await db.select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .where(whereExpr)
      .orderBy(desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return DiscoverPostQuery.toPagedResponse(
      rows as DiscoverRow[],
      options.userId,
      page,
      pageSize,
      Number(totalRows[0]?.count || 0),
    );
  }

  static async rate(userId: number, postId: number, score: number): Promise<DiscoverPostResponse | null> {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new AppError(ErrorCode.PARAM_ERROR, '评分必须是 1 到 5 的整数');
    }

    const db = getDb();
    const post = await db.select({
      id: schema.discoverPosts.id,
      userId: schema.discoverPosts.userId,
      deletedAt: schema.discoverPosts.deletedAt,
    }).from(schema.discoverPosts).where(eq(schema.discoverPosts.id, postId)).limit(1);
    if (!post[0] || post[0].deletedAt) return null;
    if (post[0].userId === userId) throw new AppError(ErrorCode.PARAM_ERROR, '不能给自己的帖子评分');

    await db.transaction(async (tx) => {
      const now = new Date();
      await tx.insert(schema.discoverPostRatings).values({
        postId,
        userId,
        score,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [schema.discoverPostRatings.postId, schema.discoverPostRatings.userId],
        set: { score, updatedAt: now },
      });
      const aggregate = await tx.select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${schema.discoverPostRatings.score}), 0)`,
        avg: sql<number>`coalesce(avg(${schema.discoverPostRatings.score}), 0)`,
      }).from(schema.discoverPostRatings).where(eq(schema.discoverPostRatings.postId, postId));
      await tx.update(schema.discoverPosts).set({
        ratingCount: Number(aggregate[0]?.count || 0),
        ratingSum: Number(aggregate[0]?.total || 0),
        ratingAvg: roundRating(Number(aggregate[0]?.avg || 0)),
        updatedAt: now,
      }).where(eq(schema.discoverPosts.id, postId));
    });
    return this.getDetail(userId, postId);
  }

  private static listWhere(category?: string) {
    const filters = [isNull(schema.discoverPosts.deletedAt)];
    if (category) filters.push(eq(schema.discoverPosts.category, normalizeCategory(category)));
    return and(...filters);
  }

}
