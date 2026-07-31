/**
 * [INPUT]: 依赖构造注入的 Drizzle db、CommunityProfileReader、ActivityOutboxWriter、Discover schema 与领域映射
 * [OUTPUT]: 对外提供 DiscoverPostQuery 与 SQLiteDiscoverPostService 实例，处理帖子查询、分页、用户帖子和事实/Outbox 原子点赞
 * [POS]: modules/discover/infrastructure 的帖子事实 adapter，批量资料投影经 Community，互动通知经 Notifications 窄端口完成
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema } from '../../../db';
import { AppError, ErrorCode } from '../../../utils/errors';
import type { CommunityProfile } from '../../community/domain/community';
import type { CommunityProfileReader } from '../../community/domain/ports';
import { createActivityEvents } from '../../notifications/domain/activity';
import type { ActivityOutboxWriter } from '../../notifications/domain/ports';
import {
  clampPage,
  clampPageSize,
  normalizeCategory,
  postSelect,
  toPostResponse,
  type DiscoverDatabase,
  type DiscoverTransaction,
  type DiscoverListResponse,
  type DiscoverPostResponse,
  type DiscoverRow,
  type DiscoverSort,
  type ListOptions,
} from './discover-mapping';

function requireProfile(profiles: Map<number, CommunityProfile>, userId: number) {
  const profile = profiles.get(userId);
  if (!profile) throw new Error(`Community profile projection missing for user ${userId}`);
  return profile;
}

export class DiscoverPostQuery {
  constructor(
    private readonly db: DiscoverDatabase,
    private readonly profiles: CommunityProfileReader,
  ) {}

  async findPublicPost(postId: number) {
    const rows = await this.db.select(postSelect())
      .from(schema.discoverPosts)
      .where(and(
        eq(schema.discoverPosts.id, postId),
        isNull(schema.discoverPosts.deletedAt),
      ))
      .limit(1);
    return rows[0] as DiscoverRow | undefined;
  }

  async getLikedPostIds(userId: number, postIds: readonly number[]) {
    const normalized = Array.from(new Set(postIds));
    if (normalized.length === 0) return new Set<number>();

    const rows = await this.db.select({ postId: schema.discoverPostLikes.postId })
      .from(schema.discoverPostLikes)
      .where(and(
        eq(schema.discoverPostLikes.userId, userId),
        inArray(schema.discoverPostLikes.postId, normalized),
      ));
    return new Set(rows.map((row) => row.postId));
  }

  async projectRows(rows: DiscoverRow[], viewerUserId: number) {
    const [profiles, likedPostIds] = await Promise.all([
      this.profiles.getMany(rows.map((row) => row.userId)),
      this.getLikedPostIds(viewerUserId, rows.map((row) => row.id)),
    ]);
    return rows.map((row) => toPostResponse(
      row,
      viewerUserId,
      likedPostIds.has(row.id),
      requireProfile(profiles, row.userId),
    ));
  }

  async toPagedResponse(
    rows: DiscoverRow[],
    viewerUserId: number,
    page: number,
    pageSize: number,
    total: number,
  ): Promise<DiscoverListResponse> {
    return {
      items: await this.projectRows(rows, viewerUserId),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }
}

export class SQLiteDiscoverPostService {
  constructor(
    private readonly db: DiscoverDatabase,
    private readonly query: DiscoverPostQuery,
    private readonly outbox: ActivityOutboxWriter<DiscoverTransaction>,
  ) {}

  async getDetail(userId: number, postId: number): Promise<DiscoverPostResponse | null> {
    const row = await this.query.findPublicPost(postId);
    if (!row) return null;
    return (await this.query.projectRows([row], userId))[0] ?? null;
  }

  async list(sort: Exclude<DiscoverSort, 'recommended'>, options: ListOptions): Promise<DiscoverListResponse> {
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const whereExpr = this.listWhere(options.category);
    const totalRows = await this.db.select({ count: sql<number>`count(*)` })
      .from(schema.discoverPosts)
      .where(whereExpr);
    const orderBy = sort === 'popular'
      ? [desc(schema.discoverPosts.likeCount), desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id)] as const
      : [desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id)] as const;
    const rows = await this.db.select(postSelect())
      .from(schema.discoverPosts)
      .where(whereExpr)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return this.query.toPagedResponse(
      rows as DiscoverRow[],
      options.userId,
      page,
      pageSize,
      Number(totalRows[0]?.count || 0),
    );
  }

  async listByUser(targetUserId: number, options: ListOptions): Promise<DiscoverListResponse> {
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const filters = [
      eq(schema.discoverPosts.userId, targetUserId),
      isNull(schema.discoverPosts.deletedAt),
    ];
    if (options.category) filters.push(eq(schema.discoverPosts.category, normalizeCategory(options.category)));
    const whereExpr = and(...filters);
    const totalRows = await this.db.select({ count: sql<number>`count(*)` })
      .from(schema.discoverPosts)
      .where(whereExpr);
    const rows = await this.db.select(postSelect())
      .from(schema.discoverPosts)
      .where(whereExpr)
      .orderBy(desc(schema.discoverPosts.publishedAt), desc(schema.discoverPosts.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return this.query.toPagedResponse(
      rows as DiscoverRow[],
      options.userId,
      page,
      pageSize,
      Number(totalRows[0]?.count || 0),
    );
  }

  like(userId: number, postId: number) {
    return this.setLike(userId, postId, true);
  }

  unlike(userId: number, postId: number) {
    return this.setLike(userId, postId, false);
  }

  private async setLike(userId: number, postId: number, liked: boolean) {
    const found = this.db.transaction((tx) => {
      const posts = tx.select({
        id: schema.discoverPosts.id,
        userId: schema.discoverPosts.userId,
      })
        .from(schema.discoverPosts)
        .where(and(
          eq(schema.discoverPosts.id, postId),
          isNull(schema.discoverPosts.deletedAt),
        ))
        .limit(1)
        .all();
      const post = posts[0];
      if (!post) return false;
      if (liked && post.userId === userId) {
        throw new AppError(ErrorCode.PARAM_ERROR, '不能点赞自己的帖子');
      }

      const events = createActivityEvents({
        actorUserId: userId,
        recipientUserIds: [post.userId],
        type: 'discover_like',
        resourceType: 'discover_post',
        resourceId: postId,
        createdAt: new Date(),
      });

      if (liked) {
        const inserted = tx.insert(schema.discoverPostLikes).values({
          postId,
          userId,
          createdAt: events[0]?.createdAt ?? new Date(),
        }).onConflictDoNothing().returning({ id: schema.discoverPostLikes.id }).all();
        if (inserted.length > 0) this.outbox.enqueue(tx, events);
      } else {
        const removed = tx.delete(schema.discoverPostLikes).where(and(
          eq(schema.discoverPostLikes.postId, postId),
          eq(schema.discoverPostLikes.userId, userId),
        )).returning({ id: schema.discoverPostLikes.id }).all();
        if (removed.length > 0 && events[0]) {
          this.outbox.removeLike(tx, events[0].eventId);
        }
      }

      const countRows = tx.select({ count: sql<number>`count(*)` })
        .from(schema.discoverPostLikes)
        .where(eq(schema.discoverPostLikes.postId, postId))
        .all();
      tx.update(schema.discoverPosts)
        .set({ likeCount: Number(countRows[0]?.count || 0) })
        .where(eq(schema.discoverPosts.id, postId))
        .run();
      return true;
    });

    return found ? this.getDetail(userId, postId) : null;
  }

  private listWhere(category?: string) {
    const filters = [isNull(schema.discoverPosts.deletedAt)];
    if (category) filters.push(eq(schema.discoverPosts.category, normalizeCategory(category)));
    return and(...filters);
  }
}
