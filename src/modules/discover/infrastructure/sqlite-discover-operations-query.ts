/**
 * [INPUT]: 依赖构造注入的 Drizzle db、CommunityProfileReader、Discover operations 契约与自有 schema
 * [OUTPUT]: 对外提供 SQLiteDiscoverOperationsQuery，生成帖子/点赞口径的管理只读快照
 * [POS]: discover/infrastructure 的公开管理查询 adapter，不 JOIN Identity/Community 表且不泄露存储结构
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { desc, eq, isNull, sql } from 'drizzle-orm';
import { schema } from '../../../db';
import { beijingIsoString } from '../../../utils/time';
import type { CommunityProfileReader } from '../../community/domain/ports';
import { safeParseJsonArray, type DiscoverStoredImage } from '../domain/discover';
import type { DiscoverOperationsQueryPort, DiscoverOperationsSnapshot } from '../domain/operations-query';
import type { DiscoverDatabase } from './discover-mapping';

export class SQLiteDiscoverOperationsQuery implements DiscoverOperationsQueryPort {
  constructor(
    private readonly db: DiscoverDatabase,
    private readonly profiles: CommunityProfileReader,
  ) {}

  async getSnapshot(limit: number): Promise<DiscoverOperationsSnapshot> {
    const [postRows, likeRows, rows] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` }).from(schema.discoverPosts)
        .where(isNull(schema.discoverPosts.deletedAt)),
      this.db.select({ count: sql<number>`count(*)` })
        .from(schema.discoverPostLikes)
        .innerJoin(schema.discoverPosts, eq(schema.discoverPostLikes.postId, schema.discoverPosts.id))
        .where(isNull(schema.discoverPosts.deletedAt)),
      this.db.select({
        id: schema.discoverPosts.id,
        userId: schema.discoverPosts.userId,
        title: schema.discoverPosts.title,
        category: schema.discoverPosts.category,
        coverUrl: schema.discoverPosts.coverUrl,
        imagesJson: schema.discoverPosts.imagesJson,
        imageCount: schema.discoverPosts.imageCount,
        likeCount: schema.discoverPosts.likeCount,
        publishedAt: schema.discoverPosts.publishedAt,
      }).from(schema.discoverPosts)
        .where(isNull(schema.discoverPosts.deletedAt))
        .orderBy(desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id))
        .limit(limit),
    ]);
    const profiles = await this.profiles.getMany(rows.map((row) => row.userId));

    return {
      totalPosts: Number(postRows[0]?.count || 0),
      totalLikes: Number(likeRows[0]?.count || 0),
      items: rows.map((row) => {
        const author = profiles.get(row.userId);
        if (!author) throw new Error(`Community profile projection missing for user ${row.userId}`);
        return {
          id: row.id,
          title: row.title || '',
          category: row.category,
          coverUrl: row.coverUrl,
          images: safeParseJsonArray<DiscoverStoredImage>(row.imagesJson, []),
          imageCount: row.imageCount,
          likeCount: row.likeCount,
          authorDisplayName: author.displayName,
          publishedAt: row.publishedAt ? beijingIsoString(row.publishedAt) : null,
        };
      }),
    };
  }
}
