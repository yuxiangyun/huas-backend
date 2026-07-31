/**
 * [INPUT]: 依赖构造注入的 Drizzle db、DiscoverPostQuery/PostService、点赞事实与帖子分类/标签
 * [OUTPUT]: 对外提供 SQLiteDiscoverRecommendationService，按当前用户点赞偏好排序并在无偏好时退化 latest
 * [POS]: modules/discover/infrastructure 的推荐 adapter，只从 Discover 自有事实推断偏好，不读取用户资料表
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { schema } from '../../../db';
import { safeParseJsonArray } from '../domain/discover';
import { DiscoverPostQuery, SQLiteDiscoverPostService } from './sqlite-discover-post-service';
import {
  clampPage,
  clampPageSize,
  clampRecommendedCandidateLimit,
  normalizeCategory,
  postSelect,
  type DiscoverDatabase,
  type DiscoverListResponse,
  type DiscoverRow,
  type ListOptions,
} from './discover-mapping';

export class SQLiteDiscoverRecommendationService {
  constructor(
    private readonly db: DiscoverDatabase,
    private readonly postQuery: DiscoverPostQuery,
    private readonly posts: SQLiteDiscoverPostService,
  ) {}

  async list(options: ListOptions): Promise<DiscoverListResponse> {
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const preferenceRows = await this.db.select({
      category: schema.discoverPosts.category,
      tagsJson: schema.discoverPosts.tagsJson,
    })
      .from(schema.discoverPostLikes)
      .innerJoin(schema.discoverPosts, eq(schema.discoverPostLikes.postId, schema.discoverPosts.id))
      .where(and(
        eq(schema.discoverPostLikes.userId, options.userId),
        isNull(schema.discoverPosts.deletedAt),
      ));

    if (preferenceRows.length === 0) return this.posts.list('latest', options);

    const tagWeights = new Map<string, number>();
    const categoryWeights = new Map<string, number>();
    for (const row of preferenceRows) {
      categoryWeights.set(row.category, (categoryWeights.get(row.category) || 0) + 1);
      for (const tag of safeParseJsonArray<string>(row.tagsJson, [])) {
        tagWeights.set(tag, (tagWeights.get(tag) || 0) + 1);
      }
    }

    const filters = [isNull(schema.discoverPosts.deletedAt)];
    if (options.category) filters.push(eq(schema.discoverPosts.category, normalizeCategory(options.category)));
    const candidates = await this.db.select(postSelect())
      .from(schema.discoverPosts)
      .where(and(...filters))
      .orderBy(desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id))
      .limit(clampRecommendedCandidateLimit(page, pageSize)) as DiscoverRow[];
    const ranked = candidates
      .map((row) => ({ row, matchScore: this.matchScore(row, tagWeights, categoryWeights) }))
      .filter((item) => item.matchScore > 0)
      .sort((left, right) => {
        if (right.matchScore !== left.matchScore) return right.matchScore - left.matchScore;
        if (right.row.likeCount !== left.row.likeCount) return right.row.likeCount - left.row.likeCount;
        const publishedDelta = right.row.publishedAt.getTime() - left.row.publishedAt.getTime();
        return publishedDelta || right.row.id - left.row.id;
      });

    if (ranked.length === 0) return this.posts.list('latest', options);
    const start = (page - 1) * pageSize;
    const rows = ranked.slice(start, start + pageSize).map((item) => item.row);
    return this.postQuery.toPagedResponse(rows, options.userId, page, pageSize, ranked.length);
  }

  private matchScore(
    row: DiscoverRow,
    tagWeights: Map<string, number>,
    categoryWeights: Map<string, number>,
  ) {
    return safeParseJsonArray<string>(row.tagsJson, [])
      .reduce((score, tag) => score + (tagWeights.get(tag) || 0), categoryWeights.get(row.category) || 0);
  }
}
