/**
 * [INPUT]: 依赖 Discover operations query 契约、领域映射规则与 Drizzle db/schema
 * [OUTPUT]: 对外提供 SQLiteDiscoverOperationsQuery，生成 Discover 管理只读快照
 * [POS]: discover/infrastructure 的公开管理查询 adapter，独占帖子/评分表与作者 join 细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { beijingIsoString } from '../../../utils/time';
import { buildDiscoverAuthorLabel, safeParseJsonArray, type DiscoverStoredImage } from '../domain/discover';
import type { DiscoverOperationsQueryPort, DiscoverOperationsSnapshot } from '../domain/operations-query';

export class SQLiteDiscoverOperationsQuery implements DiscoverOperationsQueryPort {
  async getSnapshot(limit: number): Promise<DiscoverOperationsSnapshot> {
    const db = getDb();
    const [postRows, ratingRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(schema.discoverPosts)
        .where(isNull(schema.discoverPosts.deletedAt)),
      db.select({ count: sql<number>`count(*)` }).from(schema.discoverPostRatings),
      db.select({
        id: schema.discoverPosts.id,
        title: schema.discoverPosts.title,
        category: schema.discoverPosts.category,
        coverUrl: schema.discoverPosts.coverUrl,
        imagesJson: schema.discoverPosts.imagesJson,
        imageCount: schema.discoverPosts.imageCount,
        ratingAvg: schema.discoverPosts.ratingAvg,
        ratingCount: schema.discoverPosts.ratingCount,
        publishedAt: schema.discoverPosts.publishedAt,
        authorClassName: schema.users.className,
      }).from(schema.discoverPosts)
        .innerJoin(schema.users, eq(schema.discoverPosts.userId, schema.users.id))
        .where(isNull(schema.discoverPosts.deletedAt))
        .orderBy(desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id))
        .limit(limit),
    ]);

    return {
      totalPosts: Number(postRows[0]?.count || 0),
      totalRatings: Number(ratingRows[0]?.count || 0),
      items: rows.map((row) => ({
        id: row.id,
        title: row.title || '',
        category: row.category,
        coverUrl: row.coverUrl,
        images: safeParseJsonArray<DiscoverStoredImage>(row.imagesJson, []),
        imageCount: row.imageCount,
        ratingAverage: Math.round(Number(row.ratingAvg || 0) * 100) / 100,
        ratingCount: row.ratingCount,
        authorLabel: buildDiscoverAuthorLabel(row.authorClassName),
        publishedAt: row.publishedAt ? beijingIsoString(row.publishedAt) : null,
      })),
    };
  }
}
