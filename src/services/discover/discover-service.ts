import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { config } from '../../config';
import { getDb, schema } from '../../db';
import { AppError, ErrorCode } from '../../utils/errors';
import {
  buildDiscoverAuthorLabel,
  DISCOVER_CATEGORIES,
  DISCOVER_COMMON_TAGS,
  isDiscoverCategory,
  safeParseJsonArray,
  type DiscoverStoredImage,
} from '../../utils/discover';
import { Logger } from '../../utils/logger';
import { beijingIsoString } from '../../utils/time';
import { DiscoverMediaService } from './media-service';

type DiscoverSort = 'latest' | 'score' | 'recommended';

interface ListOptions {
  userId: number;
  category?: string;
  page?: number;
  pageSize?: number;
}

interface DiscoverRow {
  id: number;
  userId: number;
  title: string | null;
  category: string;
  imagesJson: string;
  tagsJson: string;
  coverUrl: string;
  imageCount: number;
  ratingCount: number;
  ratingSum: number;
  ratingAvg: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date;
  deletedAt: Date | null;
  storageKey: string;
  authorClassName: string | null;
}

interface CreatePostInput {
  userId: number;
  title?: string;
  category: string;
  tags: string[];
  images: File[];
}

interface DiscoverPostResponse {
  id: number;
  title: string;
  category: string;
  tags: string[];
  images: DiscoverStoredImage[];
  coverUrl: string;
  imageCount: number;
  rating: {
    average: number;
    count: number;
    total: number;
    userScore: number | null;
  };
  author: {
    id: number;
    label: string;
  };
  isMine: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface DiscoverListResponse {
  items: DiscoverPostResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const RECOMMENDED_CANDIDATE_BASE_LIMIT = 120;
const RECOMMENDED_CANDIDATE_MULTIPLIER = 8;
const RECOMMENDED_CANDIDATE_MAX_LIMIT = 400;

function postSelect() {
  return {
    id: schema.discoverPosts.id,
    userId: schema.discoverPosts.userId,
    title: schema.discoverPosts.title,
    category: schema.discoverPosts.category,
    storageKey: schema.discoverPosts.storageKey,
    imagesJson: schema.discoverPosts.imagesJson,
    tagsJson: schema.discoverPosts.tagsJson,
    coverUrl: schema.discoverPosts.coverUrl,
    imageCount: schema.discoverPosts.imageCount,
    ratingCount: schema.discoverPosts.ratingCount,
    ratingSum: schema.discoverPosts.ratingSum,
    ratingAvg: schema.discoverPosts.ratingAvg,
    createdAt: schema.discoverPosts.createdAt,
    updatedAt: schema.discoverPosts.updatedAt,
    publishedAt: schema.discoverPosts.publishedAt,
    deletedAt: schema.discoverPosts.deletedAt,
    authorClassName: schema.users.className,
  };
}

function clampPageSize(pageSize: number | undefined) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
}

function clampPage(page: number | undefined) {
  if (!page || !Number.isFinite(page) || page <= 0) return 1;
  return Math.floor(page);
}

function clampRecommendedCandidateLimit(page: number, pageSize: number) {
  const requested = page * pageSize * RECOMMENDED_CANDIDATE_MULTIPLIER;
  return Math.min(RECOMMENDED_CANDIDATE_MAX_LIMIT, Math.max(RECOMMENDED_CANDIDATE_BASE_LIMIT, requested));
}

function recommendedRatingJoin(userId: number) {
  return and(
    eq(schema.discoverPostRatings.postId, schema.discoverPosts.id),
    eq(schema.discoverPostRatings.userId, userId),
  );
}

function normalizeTitle(value: string | undefined) {
  const title = value?.trim() || '';
  if (!title) return null;
  if (title.length > config.discover.maxTitleLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `标题不能超过 ${config.discover.maxTitleLength} 个字`);
  }
  return title;
}

function normalizeTags(tags: string[]) {
  const normalized = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    if (tag.length > config.discover.maxTagLength) {
      throw new AppError(ErrorCode.PARAM_ERROR, `标签不能超过 ${config.discover.maxTagLength} 个字`);
    }

    const dedupeKey = tag.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(tag);
  }

  if (normalized.length === 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, '请至少填写一个标签');
  }

  if (normalized.length > config.discover.maxTagsPerPost) {
    throw new AppError(ErrorCode.PARAM_ERROR, `标签数量不能超过 ${config.discover.maxTagsPerPost} 个`);
  }

  return normalized;
}

function normalizeCategory(category: string) {
  const value = category.trim();
  if (!isDiscoverCategory(value)) {
    throw new AppError(ErrorCode.PARAM_ERROR, '分类不合法');
  }
  return value;
}

function roundRating(value: number) {
  return Math.round(value * 100) / 100;
}

export class DiscoverService {
  static getMeta() {
    return {
      categories: [...DISCOVER_CATEGORIES],
      commonTags: [...DISCOVER_COMMON_TAGS],
      limits: {
        maxImagesPerPost: config.discover.maxImagesPerPost,
        maxTagsPerPost: config.discover.maxTagsPerPost,
        maxTitleLength: config.discover.maxTitleLength,
        maxTagLength: config.discover.maxTagLength,
      },
    };
  }

  static async createPost(input: CreatePostInput): Promise<DiscoverPostResponse | null> {
    const category = normalizeCategory(input.category);
    const tags = normalizeTags(input.tags);
    const title = normalizeTitle(input.title);

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
        category,
        storageKey: media.storageKey,
        imagesJson: JSON.stringify(media.images),
        tagsJson: JSON.stringify(tags),
        coverUrl: media.coverUrl,
        imageCount: media.images.length,
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
    return this.toPostResponse(row, userId, userScores.get(postId) ?? null);
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

  static async adminDeletePost(postId: number) {
    const db = getDb();
    const now = new Date();
    const updated = await db.update(schema.discoverPosts)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(schema.discoverPosts.id, postId),
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
      items: rows.map((row) => this.toPostResponse(row, userId, userScores.get(row.id) ?? null)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  private static toPostResponse(row: DiscoverRow, userId: number, userScore: number | null): DiscoverPostResponse {
    const images = safeParseJsonArray<DiscoverStoredImage>(row.imagesJson, []);
    const tags = safeParseJsonArray<string>(row.tagsJson, []);

    return {
      id: row.id,
      title: row.title || '',
      category: row.category,
      tags,
      images,
      coverUrl: row.coverUrl,
      imageCount: row.imageCount,
      rating: {
        average: roundRating(Number(row.ratingAvg || 0)),
        count: row.ratingCount,
        total: row.ratingSum,
        userScore,
      },
      author: {
        id: row.userId,
        label: buildDiscoverAuthorLabel(row.authorClassName),
      },
      isMine: row.userId === userId,
      publishedAt: beijingIsoString(row.publishedAt),
      createdAt: beijingIsoString(row.createdAt),
      updatedAt: beijingIsoString(row.updatedAt),
    };
  }
}
