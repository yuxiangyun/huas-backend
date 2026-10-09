import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { schema } from '../../../db';
import { AppError, ErrorCode } from '../../../utils/errors';
import { resolvePagination } from '../../../utils/pagination';
import { beijingIsoString } from '../../../utils/time';
import type { CommunityProfile } from '../../community/domain/community';
import type { CommunityProfileReader } from '../../community/domain/ports';
import { DISCOVER_CATEGORIES, isDiscoverCategory, safeParseJsonArray, type DiscoverCommentRow, type DiscoverRow } from '../domain/discover';
import type { AdminDiscoverComment, AdminDiscoverCommentList, AdminDiscoverListOptions, AdminDiscoverPost, AdminDiscoverPostList } from '../domain/operations-query';
import { commentSelect, postSelect, type DiscoverDatabase } from './discover-mapping';

function requireProfile(profiles: Map<number, CommunityProfile>, userId: number) {
  const profile = profiles.get(userId);
  if (!profile) throw new AppError(ErrorCode.INTERNAL_ERROR, '好饭作者资料不可用');
  return profile;
}

function mapPost(row: DiscoverRow, author: CommunityProfile): AdminDiscoverPost {
  return {
    id: row.id,
    title: row.title || '',
    storeName: row.storeName || '',
    priceText: row.priceText || '',
    content: row.content || '',
    category: row.category,
    tags: safeParseJsonArray<string>(row.tagsJson, []),
    images: safeParseJsonArray(row.imagesJson, []),
    coverUrl: row.coverUrl,
    imageCount: row.imageCount,
    stats: { likeCount: row.likeCount, commentCount: row.commentCount },
    author,
    publishedAt: beijingIsoString(row.publishedAt),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export class SQLiteDiscoverAdminQuery {
  constructor(private readonly db: DiscoverDatabase, private readonly profiles: CommunityProfileReader) {}

  async getSummary() {
    const [posts, comments, likes] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` }).from(schema.discoverPosts)
        .where(isNull(schema.discoverPosts.deletedAt)),
      this.db.select({ count: sql<number>`count(*)` }).from(schema.discoverComments)
        .innerJoin(schema.discoverPosts, eq(schema.discoverComments.postId, schema.discoverPosts.id))
        .where(and(isNull(schema.discoverPosts.deletedAt), isNull(schema.discoverComments.deletedAt))),
      this.db.select({ count: sql<number>`count(*)` }).from(schema.discoverPostLikes)
        .innerJoin(schema.discoverPosts, eq(schema.discoverPostLikes.postId, schema.discoverPosts.id))
        .where(isNull(schema.discoverPosts.deletedAt)),
    ]);
    return { totalPosts: Number(posts[0]?.count || 0), totalComments: Number(comments[0]?.count || 0), totalLikes: Number(likes[0]?.count || 0) };
  }

  async listPosts(options: AdminDiscoverListOptions): Promise<AdminDiscoverPostList> {
    const { page, pageSize, offset } = resolvePagination(options, 20, 50);
    const keyword = options.keyword?.trim() || '';
    const category = options.category?.trim() || '';
    if (category && !isDiscoverCategory(category)) throw new AppError(ErrorCode.PARAM_ERROR, '分类不合法');
    const filters = [isNull(schema.discoverPosts.deletedAt)];
    if (category) filters.push(eq(schema.discoverPosts.category, category));
    if (keyword) {
      const pattern = `%${keyword.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
      filters.push(or(
        sql`${schema.discoverPosts.title} LIKE ${pattern} ESCAPE ${'\\'}`,
        sql`${schema.discoverPosts.content} LIKE ${pattern} ESCAPE ${'\\'}`,
        sql`${schema.discoverPosts.storeName} LIKE ${pattern} ESCAPE ${'\\'}`,
      )!);
    }
    const where = and(...filters);
    const [summary, totals, rows] = await Promise.all([
      this.getSummary(),
      this.db.select({ count: sql<number>`count(*)` }).from(schema.discoverPosts).where(where),
      this.db.select(postSelect()).from(schema.discoverPosts).where(where)
        .orderBy(desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id)).limit(pageSize).offset(offset),
    ]);
    const profiles = await this.profiles.getMany(rows.map((row) => row.userId));
    const total = Number(totals[0]?.count || 0);
    return {
      summary,
      items: rows.map((row) => mapPost(row, requireProfile(profiles, row.userId))),
      page, pageSize, total, hasMore: pageSize < total - offset,
      options: { categories: [...DISCOVER_CATEGORIES] },
    };
  }

  async getPost(postId: number) {
    const rows = await this.db.select(postSelect()).from(schema.discoverPosts)
      .where(and(eq(schema.discoverPosts.id, postId), isNull(schema.discoverPosts.deletedAt))).limit(1);
    const row = rows[0];
    if (!row) return null;
    const profiles = await this.profiles.getMany([row.userId]);
    return mapPost(row, requireProfile(profiles, row.userId));
  }

  async listComments(postId: number, options: { page?: number; pageSize?: number }): Promise<AdminDiscoverCommentList | null> {
    const { page, pageSize, offset } = resolvePagination(options, 50, 100);
    const post = await this.db.select({ id: schema.discoverPosts.id }).from(schema.discoverPosts)
      .where(and(eq(schema.discoverPosts.id, postId), isNull(schema.discoverPosts.deletedAt))).limit(1);
    if (!post[0]) return null;
    const where = and(eq(schema.discoverComments.postId, postId), isNull(schema.discoverComments.deletedAt));
    const [totals, rows] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` }).from(schema.discoverComments).where(where),
      this.db.select(commentSelect()).from(schema.discoverComments).where(where)
        .orderBy(desc(schema.discoverComments.createdAt), desc(schema.discoverComments.id)).limit(pageSize).offset(offset),
    ]);
    const profiles = await this.profiles.getMany(rows.map((row) => row.userId));
    const items: AdminDiscoverComment[] = rows.map((row: DiscoverCommentRow) => ({
      id: row.id, postId: row.postId, parentCommentId: row.parentCommentId,
      content: row.content, author: requireProfile(profiles, row.userId),
      createdAt: beijingIsoString(row.createdAt), updatedAt: beijingIsoString(row.updatedAt),
    }));
    const total = Number(totals[0]?.count || 0);
    return { items, page, pageSize, total, hasMore: pageSize < total - offset };
  }
}
