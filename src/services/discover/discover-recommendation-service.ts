/**
 * [INPUT]: 依赖 db/schema、discover-shared 推荐边界与 discover-post-service 的分页响应组件
 * [OUTPUT]: 对外提供 DiscoverRecommendationService，按用户评分偏好或时间兜底返回推荐帖子
 * [POS]: services/discover 的推荐用例组件，与普通帖子列表和评论事务解耦
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { getDb, schema } from '../../db';
import { safeParseJsonArray } from '../../utils/discover';
import { DiscoverPostQuery } from './discover-post-service';
import {
  clampPage,
  clampPageSize,
  clampRecommendedCandidateLimit,
  normalizeCategory,
  postSelect,
  recommendedRatingJoin,
  type DiscoverListResponse,
  type DiscoverRow,
  type ListOptions,
} from './discover-shared';

export class DiscoverRecommendationService {
  static async list(options: ListOptions): Promise<DiscoverListResponse> {
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const preferenceRows = await getDb().select({
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
      return this.listFallback(options, page, pageSize);
    }

    const ranked = (await this.listCandidates(options, page, pageSize))
      .map((row) => ({ row, matchScore: this.matchScore(row, tagWeights, categoryWeights) }))
      .filter((item) => item.matchScore > 0)
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        if (b.row.ratingAvg !== a.row.ratingAvg) return b.row.ratingAvg - a.row.ratingAvg;
        return b.row.publishedAt.getTime() - a.row.publishedAt.getTime();
      });

    if (ranked.length === 0) return this.listFallback(options, page, pageSize);
    const start = (page - 1) * pageSize;
    const rows = ranked.slice(start, start + pageSize).map((item) => item.row);
    return DiscoverPostQuery.toPagedResponse(rows, options.userId, page, pageSize, ranked.length);
  }

  private static matchScore(
    row: DiscoverRow,
    tagWeights: Map<string, number>,
    categoryWeights: Map<string, number>,
  ) {
    return safeParseJsonArray<string>(row.tagsJson, [])
      .reduce((score, tag) => score + (tagWeights.get(tag) || 0), categoryWeights.get(row.category) || 0);
  }

  private static async listFallback(options: ListOptions, page: number, pageSize: number) {
    const db = getDb();
    const filters = this.candidateFilters(options);
    const ratingJoin = recommendedRatingJoin(options.userId);
    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.discoverPosts)
      .leftJoin(schema.discoverPostRatings, ratingJoin)
      .where(and(...filters));

    const rows = await db.select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .leftJoin(schema.discoverPostRatings, ratingJoin)
      .where(and(...filters))
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

  private static async listCandidates(options: ListOptions, page: number, pageSize: number) {
    const db = getDb();
    const filters = this.candidateFilters(options);
    const ratingJoin = recommendedRatingJoin(options.userId);
    const limit = clampRecommendedCandidateLimit(page, pageSize);

    const latestRows = await db.select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .leftJoin(schema.discoverPostRatings, ratingJoin)
      .where(and(...filters))
      .orderBy(desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id))
      .limit(limit);
    const scoreRows = await db.select(postSelect())
      .from(schema.discoverPosts)
      .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
      .leftJoin(schema.discoverPostRatings, ratingJoin)
      .where(and(...filters))
      .orderBy(desc(schema.discoverPosts.ratingAvg), desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id))
      .limit(limit);

    const merged = new Map<number, DiscoverRow>();
    for (const row of [...latestRows, ...scoreRows] as DiscoverRow[]) {
      if (!merged.has(row.id)) merged.set(row.id, row);
    }
    return [...merged.values()];
  }

  private static candidateFilters(options: ListOptions) {
    const filters = [
      isNull(schema.discoverPosts.deletedAt),
      ne(schema.discoverPosts.userId, options.userId),
      isNull(schema.discoverPostRatings.id),
    ];
    if (options.category) filters.push(eq(schema.discoverPosts.category, normalizeCategory(options.category)));
    return filters;
  }
}
