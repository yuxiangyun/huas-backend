/**
 * [INPUT]: 依赖 db/schema 的 Discover 表、discover-shared 的领域规则、media-service 的图片持久化能力
 * [OUTPUT]: 对外提供 DiscoverUserService 用户侧帖子/评论/评分/推荐业务方法与兼容类型再导出
 * [POS]: services/discover 的用户业务编排器，承接路由请求并消费共享领域内核
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { config } from '../../config';
import { getDb, schema } from '../../db';
import { AppError, ErrorCode } from '../../utils/errors';
import { safeParseJsonArray } from '../../utils/discover';
import { Logger } from '../../utils/logger';
import { DiscoverMediaService } from './media-service';
import {
  clampCommentPageSize,
  clampPage,
  clampPageSize,
  clampRecommendedCandidateLimit,
  commentSelect,
  getDiscoverMeta,
  normalizeCategory,
  normalizeCommentContent,
  normalizeContent,
  normalizePriceText,
  normalizeStoreName,
  normalizeTags,
  normalizeTitle,
  postSelect,
  recommendedRatingJoin,
  roundRating,
  toCommentResponse,
  toPostResponse,
  type CreateDiscoverCommentInput,
  type CreatePostInput,
  type DiscoverCommentListResponse,
  type DiscoverCommentResponse,
  type DiscoverCommentRow,
  type DiscoverListResponse,
  type DiscoverPostResponse,
  type DiscoverRow,
  type DiscoverSort,
  type ListOptions,
} from './discover-shared';

export type {
  CreateDiscoverCommentInput,
  CreatePostInput,
  DiscoverCommentListResponse,
  DiscoverCommentResponse,
  DiscoverListResponse,
  DiscoverPostResponse,
  DiscoverSort,
  ListOptions,
} from './discover-shared';

export class DiscoverUserService {
  static getMeta() {
    return getDiscoverMeta();
  }

  static async createPost(input: CreatePostInput): Promise<DiscoverPostResponse | null> {
    const category = normalizeCategory(input.category);
    const tags = normalizeTags(input.tags);
    const title = normalizeTitle(input.title);
    const storeName = normalizeStoreName(input.storeName);
    const priceText = normalizePriceText(input.priceText);
    const content = normalizeContent(input.content);

    if (input.images.length === 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '至少上传一张图片');
    }
    if (input.images.length > config.discover.maxImagesPerPost) {
      throw new AppError(ErrorCode.PARAM_ERROR, `最多上传 ${config.discover.maxImagesPerPost} 张图片`);
    }

    const media = await DiscoverMediaService.compressAndStoreImages(input.images);
    const now = new Date();
    const db = getDb();

    try {
      const inserted = await db.insert(schema.discoverPosts).values({
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

      return this.getPostDetail(input.userId, inserted[0].id);
    } catch (err) {
      await DiscoverMediaService.removeStorage(media.storageKey);
      throw err;
    }
  }

  static async getPostDetail(userId: number, postId: number): Promise<DiscoverPostResponse | null> {
    const row = await this.findPublicPost(postId);
    if (!row) return null;

    const userScores = await this.getUserScoreMap(userId, [postId]);
    return toPostResponse(row, userId, userScores.get(postId) ?? null);
  }

  static async listPosts(sort: DiscoverSort, options: ListOptions): Promise<DiscoverListResponse> {
    if (sort === 'recommended') {
      return this.listRecommendedPosts(options);
    }

    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const whereExpr = this.buildListWhere(options.category);

    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.discoverPosts)
      .where(whereExpr);
    const total = Number(totalRows[0]?.count || 0);
    const offset = (page - 1) * pageSize;

    const orderBy = sort === 'score'
      ? [desc(schema.discoverPosts.ratingAvg), desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id)] as const
      : [desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id)] as const;

    const rows = await db.select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .where(whereExpr)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset(offset);

    return this.toPagedResponse(rows as DiscoverRow[], options.userId, page, pageSize, total);
  }

  static async listMyPosts(options: ListOptions): Promise<DiscoverListResponse> {
    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const filters = [eq(schema.discoverPosts.userId, options.userId), isNull(schema.discoverPosts.deletedAt)];

    if (options.category) {
      filters.push(eq(schema.discoverPosts.category, normalizeCategory(options.category)));
    }

    const whereExpr = and(...filters);
    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.discoverPosts)
      .where(whereExpr);
    const total = Number(totalRows[0]?.count || 0);
    const offset = (page - 1) * pageSize;

    const rows = await db.select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .where(whereExpr)
      .orderBy(desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id))
      .limit(pageSize)
      .offset(offset);

    return this.toPagedResponse(rows as DiscoverRow[], options.userId, page, pageSize, total);
  }

  static async ratePost(userId: number, postId: number, score: number): Promise<DiscoverPostResponse | null> {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new AppError(ErrorCode.PARAM_ERROR, '评分必须是 1 到 5 的整数');
    }

    const db = getDb();
    const post = await db.select({
      id: schema.discoverPosts.id,
      userId: schema.discoverPosts.userId,
      deletedAt: schema.discoverPosts.deletedAt,
    })
      .from(schema.discoverPosts)
      .where(eq(schema.discoverPosts.id, postId))
      .limit(1);

    const target = post[0];
    if (!target || target.deletedAt) return null;
    if (target.userId === userId) {
      throw new AppError(ErrorCode.PARAM_ERROR, '不能给自己的帖子评分');
    }

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
        set: {
          score,
          updatedAt: now,
        },
      });

      const aggregate = await tx.select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${schema.discoverPostRatings.score}), 0)`,
        avg: sql<number>`coalesce(avg(${schema.discoverPostRatings.score}), 0)`,
      })
        .from(schema.discoverPostRatings)
        .where(eq(schema.discoverPostRatings.postId, postId));

      const summary = aggregate[0];
      await tx.update(schema.discoverPosts)
        .set({
          ratingCount: Number(summary?.count || 0),
          ratingSum: Number(summary?.total || 0),
          ratingAvg: roundRating(Number(summary?.avg || 0)),
          updatedAt: now,
        })
        .where(eq(schema.discoverPosts.id, postId));
    });

    return this.getPostDetail(userId, postId);
  }

  static async listComments(
    userId: number,
    postId: number,
    options: { page?: number; pageSize?: number }
  ): Promise<DiscoverCommentListResponse | null> {
    const post = await this.findPublicPost(postId);
    if (!post) return null;

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
    const total = Number(totalRows[0]?.count || 0);
    const rows = await db.select(commentSelect())
      .from(schema.discoverComments)
      .innerJoin(schema.users, eq(schema.discoverComments.userId, schema.users.id))
      .where(whereExpr)
      .orderBy(asc(schema.discoverComments.createdAt), asc(schema.discoverComments.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: (rows as DiscoverCommentRow[]).map((row) => toCommentResponse(row, userId)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  static async createComment(input: CreateDiscoverCommentInput): Promise<DiscoverCommentResponse | null> {
    const content = normalizeCommentContent(input.content);
    const parentCommentId = input.parentCommentId ?? null;
    if (parentCommentId !== null && (!Number.isInteger(parentCommentId) || parentCommentId <= 0)) {
      throw new AppError(ErrorCode.PARAM_ERROR, '父评论 ID 不合法');
    }

    const db = getDb();
    const createdCommentId = await db.transaction(async (tx) => {
      const postRows = await tx.select({ id: schema.discoverPosts.id })
        .from(schema.discoverPosts)
        .where(and(
          eq(schema.discoverPosts.id, input.postId),
          isNull(schema.discoverPosts.deletedAt),
        ))
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
        if (!parentRows[0]) {
          throw new AppError(ErrorCode.PARAM_ERROR, '回复的评论不存在');
        }
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

    const row = await this.findCommentById(createdCommentId);
    if (!row) return null;
    return toCommentResponse(row, input.userId);
  }

  static async deleteComment(commentId: number, userId: number) {
    const db = getDb();
    return db.transaction(async (tx) => {
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
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(schema.discoverComments.id, activeComment.id),
          eq(schema.discoverComments.userId, userId),
          eq(schema.discoverComments.postId, activeComment.postId),
          isNull(schema.discoverComments.deletedAt),
        ))
        .returning({
          id: schema.discoverComments.id,
          postId: schema.discoverComments.postId,
        });

      if (!updated[0]) return null;

      await this.refreshPostCommentCount(tx, updated[0].postId, now);
      return updated[0];
    });
  }

  static async deletePost(postId: number, userId: number) {
    const db = getDb();
    const now = new Date();
    const updated = await db.update(schema.discoverPosts)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(schema.discoverPosts.id, postId),
        eq(schema.discoverPosts.userId, userId),
        isNull(schema.discoverPosts.deletedAt),
      ))
      .returning({
        id: schema.discoverPosts.id,
        storageKey: schema.discoverPosts.storageKey,
      });

    await this.cleanupDeletedPostStorage(updated[0]);

    return updated[0] ? { id: updated[0].id } : null;
  }

  private static async cleanupDeletedPostStorage(post?: { id: number; storageKey: string } | null) {
    if (!post) return;

    try {
      await DiscoverMediaService.removeStorage(post.storageKey);
    } catch (err: any) {
      Logger.error('DiscoverService', `帖子 ${post.id} 删除后清理图片失败`, err);
    }
  }

  private static async listRecommendedPosts(options: ListOptions): Promise<DiscoverListResponse> {
    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const preferenceRows = await db.select({
      postId: schema.discoverPostRatings.postId,
      score: schema.discoverPostRatings.score,
      category: schema.discoverPosts.category,
      tagsJson: schema.discoverPosts.tagsJson,
    })
      .from(schema.discoverPostRatings)
      .innerJoin(schema.discoverPosts, eq(schema.discoverPostRatings.postId, schema.discoverPosts.id))
      .where(and(
        eq(schema.discoverPostRatings.userId, options.userId),
        isNull(schema.discoverPosts.deletedAt),
      ));

    const tagWeights = new Map<string, number>();
    const categoryWeights = new Map<string, number>();

    for (const row of preferenceRows) {
      const weight = Math.max(0, row.score - 2);
      if (weight <= 0) continue;

      categoryWeights.set(row.category, (categoryWeights.get(row.category) || 0) + weight);
      for (const tag of safeParseJsonArray<string>(row.tagsJson, [])) {
        tagWeights.set(tag, (tagWeights.get(tag) || 0) + weight);
      }
    }

    if (tagWeights.size === 0 && categoryWeights.size === 0) {
      return this.listRecommendedFallbackPosts(options, page, pageSize);
    }

    const candidateRows = await this.listRecommendedCandidateRows(options, page, pageSize);
    const ranked = candidateRows
      .map((row) => {
        const tags = safeParseJsonArray<string>(row.tagsJson, []);
        let matchScore = categoryWeights.get(row.category) || 0;
        for (const tag of tags) {
          matchScore += tagWeights.get(tag) || 0;
        }

        return {
          row,
          matchScore,
        };
      })
      .filter((item) => item.matchScore > 0)
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        if (b.row.ratingAvg !== a.row.ratingAvg) return b.row.ratingAvg - a.row.ratingAvg;
        return b.row.publishedAt.getTime() - a.row.publishedAt.getTime();
      });

    if (ranked.length === 0) {
      return this.listRecommendedFallbackPosts(options, page, pageSize);
    }

    const total = ranked.length;
    const start = (page - 1) * pageSize;
    const pageRows = ranked.slice(start, start + pageSize).map((item) => item.row);
    return this.toPagedResponse(pageRows, options.userId, page, pageSize, total);
  }

  private static async listRecommendedFallbackPosts(
    options: ListOptions,
    page = clampPage(options.page),
    pageSize = clampPageSize(options.pageSize)
  ): Promise<DiscoverListResponse> {
    const db = getDb();
    const filters = this.buildRecommendedCandidateFilters(options);
    const ratingJoin = recommendedRatingJoin(options.userId);
    const offset = (page - 1) * pageSize;

    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.discoverPosts)
      .leftJoin(schema.discoverPostRatings, ratingJoin)
      .where(and(...filters));
    const total = Number(totalRows[0]?.count || 0);

    const rows = await db.select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .leftJoin(schema.discoverPostRatings, ratingJoin)
      .where(and(...filters))
      .orderBy(desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id))
      .limit(pageSize)
      .offset(offset);

    return this.toPagedResponse(rows as DiscoverRow[], options.userId, page, pageSize, total);
  }

  private static async listRecommendedCandidateRows(options: ListOptions, page: number, pageSize: number): Promise<DiscoverRow[]> {
    const db = getDb();
    const filters = this.buildRecommendedCandidateFilters(options);
    const ratingJoin = recommendedRatingJoin(options.userId);
    const candidateLimit = clampRecommendedCandidateLimit(page, pageSize);

    const latestRows = await db.select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .leftJoin(schema.discoverPostRatings, ratingJoin)
      .where(and(...filters))
      .orderBy(desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id))
      .limit(candidateLimit);

    const scoreRows = await db.select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .leftJoin(schema.discoverPostRatings, ratingJoin)
      .where(and(...filters))
      .orderBy(desc(schema.discoverPosts.ratingAvg), desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id))
      .limit(candidateLimit);

    const merged = new Map<number, DiscoverRow>();
    for (const row of [...latestRows, ...scoreRows] as DiscoverRow[]) {
      if (!merged.has(row.id)) {
        merged.set(row.id, row);
      }
    }

    return [...merged.values()];
  }

  private static buildRecommendedCandidateFilters(options: ListOptions) {
    const filters = [
      isNull(schema.discoverPosts.deletedAt),
      ne(schema.discoverPosts.userId, options.userId),
      isNull(schema.discoverPostRatings.id),
    ];

    if (options.category) {
      filters.push(eq(schema.discoverPosts.category, normalizeCategory(options.category)));
    }

    return filters;
  }

  private static buildListWhere(category?: string) {
    const filters = [isNull(schema.discoverPosts.deletedAt)];
    if (category) {
      filters.push(eq(schema.discoverPosts.category, normalizeCategory(category)));
    }
    return and(...filters);
  }

  private static async findPublicPost(postId: number) {
    const db = getDb();
    const rows = await db.select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .where(and(
        eq(schema.discoverPosts.id, postId),
        isNull(schema.discoverPosts.deletedAt),
      ))
      .limit(1);

    return rows[0] as DiscoverRow | undefined;
  }

  private static async findCommentById(commentId: number) {
    const db = getDb();
    const rows = await db.select(commentSelect())
      .from(schema.discoverComments)
      .innerJoin(schema.users, eq(schema.discoverComments.userId, schema.users.id))
      .where(and(
        eq(schema.discoverComments.id, commentId),
        isNull(schema.discoverComments.deletedAt),
      ))
      .limit(1);

    return rows[0] as DiscoverCommentRow | undefined;
  }

  private static async getUserScoreMap(userId: number, postIds: number[]) {
    if (postIds.length === 0) return new Map<number, number>();

    const db = getDb();
    const rows = await db.select({
      postId: schema.discoverPostRatings.postId,
      score: schema.discoverPostRatings.score,
    })
      .from(schema.discoverPostRatings)
      .where(and(
        eq(schema.discoverPostRatings.userId, userId),
        inArray(schema.discoverPostRatings.postId, postIds),
      ));

    return new Map(rows.map((row) => [row.postId, row.score]));
  }

  private static async toPagedResponse(rows: DiscoverRow[], userId: number, page: number, pageSize: number, total: number): Promise<DiscoverListResponse> {
    const userScores = await this.getUserScoreMap(userId, rows.map((row) => row.id));

    return {
      items: rows.map((row) => toPostResponse(row, userId, userScores.get(row.id) ?? null)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  private static async refreshPostCommentCount(tx: any, postId: number, now: Date) {
    const countRows = await tx.select({ count: sql<number>`count(*)` })
      .from(schema.discoverComments)
      .where(and(
        eq(schema.discoverComments.postId, postId),
        isNull(schema.discoverComments.deletedAt),
      ));

    await tx.update(schema.discoverPosts)
      .set({
        commentCount: Number(countRows[0]?.count || 0),
        updatedAt: now,
      })
      .where(eq(schema.discoverPosts.id, postId));
  }

}
