/**
 * [INPUT]: 依赖 db/schema、discover-shared 领域规则与媒体持久化能力
 * [OUTPUT]: 对外提供 DiscoverPostService 与可复用 DiscoverPostQuery，处理帖子生命周期和公开读取
 * [POS]: services/discover 的帖子边界，查询组件被帖子、评论与推荐服务复用，推荐排序和评论事务由兄弟服务承担
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { config } from '../../config';
import { getDb, schema } from '../../db';
import { AppError, ErrorCode } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import { DiscoverMediaService } from './media-service';
import {
  clampPage,
  clampPageSize,
  normalizeCategory,
  normalizeContent,
  normalizePriceText,
  normalizeStoreName,
  normalizeTags,
  normalizeTitle,
  postSelect,
  roundRating,
  toPostResponse,
  type CreatePostInput,
  type DiscoverListResponse,
  type DiscoverPostResponse,
  type DiscoverRow,
  type DiscoverSort,
  type ListOptions,
} from './discover-shared';

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
  static async create(input: CreatePostInput): Promise<DiscoverPostResponse | null> {
    const category = normalizeCategory(input.category);
    const tags = normalizeTags(input.tags);
    const title = normalizeTitle(input.title);
    const storeName = normalizeStoreName(input.storeName);
    const priceText = normalizePriceText(input.priceText);
    const content = normalizeContent(input.content);

    if (input.images.length === 0) throw new AppError(ErrorCode.PARAM_ERROR, '至少上传一张图片');
    if (input.images.length > config.discover.maxImagesPerPost) {
      throw new AppError(ErrorCode.PARAM_ERROR, `最多上传 ${config.discover.maxImagesPerPost} 张图片`);
    }

    const media = await DiscoverMediaService.compressAndStoreImages(input.images);
    const now = new Date();
    try {
      const inserted = await getDb().insert(schema.discoverPosts).values({
        userId: input.userId,
        title,
        storeName,
        priceText,
        content,
        category,
        storageKey: media.storageKey,
        imagesJson: JSON.stringify(media.images),
        tagsJson: JSON.stringify(tags),
        coverUrl: media.coverUrl,
        imageCount: media.images.length,
        commentCount: 0,
        ratingCount: 0,
        ratingSum: 0,
        ratingAvg: 0,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
        deletedAt: null,
      }).returning({ id: schema.discoverPosts.id });
      return this.getDetail(input.userId, inserted[0].id);
    } catch (error) {
      await DiscoverMediaService.removeStorage(media.storageKey);
      throw error;
    }
  }

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

  static async delete(postId: number, userId: number) {
    const now = new Date();
    const updated = await getDb().update(schema.discoverPosts)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(
        eq(schema.discoverPosts.id, postId),
        eq(schema.discoverPosts.userId, userId),
        isNull(schema.discoverPosts.deletedAt),
      ))
      .returning({ id: schema.discoverPosts.id, storageKey: schema.discoverPosts.storageKey });
    await this.cleanupStorage(updated[0]);
    return updated[0] ? { id: updated[0].id } : null;
  }

  private static listWhere(category?: string) {
    const filters = [isNull(schema.discoverPosts.deletedAt)];
    if (category) filters.push(eq(schema.discoverPosts.category, normalizeCategory(category)));
    return and(...filters);
  }

  private static async cleanupStorage(post?: { id: number; storageKey: string } | null) {
    if (!post) return;
    try {
      await DiscoverMediaService.removeStorage(post.storageKey);
    } catch (error: any) {
      Logger.error('DiscoverService', `帖子 ${post.id} 删除后清理图片失败`, error);
    }
  }
}
