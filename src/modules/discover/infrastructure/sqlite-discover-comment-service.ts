/**
 * [INPUT]: 依赖构造注入的 Drizzle db、CommunityProfileReader、ActivityOutboxWriter、DiscoverPostQuery、领域策略与 schema
 * [OUTPUT]: 对外提供 SQLiteDiscoverCommentService，处理评论列表、父作者 reply/帖子作者 comment 原子创建、删除与计数，删除时同事务撤回该评论事件
 * [POS]: modules/discover/infrastructure 的评论事实 adapter，复用 Notifications 共享接收规则防止两条 UGC 支线语义漂移
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { schema } from '../../../db';
import { AppError, ErrorCode } from '../../../utils/errors';
import type { CommunityProfile } from '../../community/domain/community';
import type { CommunityProfileReader } from '../../community/domain/ports';
import { createCommentActivityEvents } from '../../notifications/domain/activity';
import type { ActivityOutboxWriter } from '../../notifications/domain/ports';
import type { DiscoverPolicy, PersistDiscoverCommentInput } from '../domain/discover';
import { DiscoverPostQuery } from './sqlite-discover-post-service';
import {
  clampCommentPageSize,
  clampPage,
  commentSelect,
  toCommentResponse,
  type DiscoverCommentListResponse,
  type DiscoverCommentResponse,
  type DiscoverCommentRow,
  type DiscoverDatabase,
  type DiscoverTransaction,
} from './discover-mapping';

function requireProfile(profiles: Map<number, CommunityProfile>, userId: number) {
  const profile = profiles.get(userId);
  if (!profile) throw new Error(`Community profile projection missing for user ${userId}`);
  return profile;
}

export class SQLiteDiscoverCommentService {
  constructor(
    private readonly db: DiscoverDatabase,
    private readonly postQuery: DiscoverPostQuery,
    private readonly profiles: CommunityProfileReader,
    private readonly policy: DiscoverPolicy,
    private readonly outbox: ActivityOutboxWriter<DiscoverTransaction>,
  ) {}

  async list(
    userId: number,
    postId: number,
    options: { page?: number; pageSize?: number },
  ): Promise<DiscoverCommentListResponse | null> {
    if (!await this.postQuery.findPublicPost(postId)) return null;

    const page = clampPage(options.page);
    const pageSize = clampCommentPageSize(options.pageSize, this.policy);
    const whereExpr = and(
      eq(schema.discoverComments.postId, postId),
      isNull(schema.discoverComments.deletedAt),
    );
    const totalRows = await this.db.select({ count: sql<number>`count(*)` })
      .from(schema.discoverComments)
      .where(whereExpr);
    const rows = await this.db.select(commentSelect())
      .from(schema.discoverComments)
      .where(whereExpr)
      .orderBy(asc(schema.discoverComments.createdAt), asc(schema.discoverComments.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize) as DiscoverCommentRow[];
    const total = Number(totalRows[0]?.count || 0);

    return {
      items: await this.projectRows(rows, userId),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  async create(input: PersistDiscoverCommentInput): Promise<DiscoverCommentResponse | null> {
    const createdCommentId = this.db.transaction((tx) => {
      const postRows = tx.select({
        id: schema.discoverPosts.id,
        authorUserId: schema.discoverPosts.userId,
      })
        .from(schema.discoverPosts)
        .where(and(eq(schema.discoverPosts.id, input.postId), isNull(schema.discoverPosts.deletedAt)))
        .limit(1)
        .all();
      if (!postRows[0]) return null;

      let parentAuthorUserId: number | null = null;
      if (input.parentCommentId !== null) {
        const parentRows = tx.select({
          id: schema.discoverComments.id,
          authorUserId: schema.discoverComments.userId,
        })
          .from(schema.discoverComments)
          .where(and(
            eq(schema.discoverComments.id, input.parentCommentId),
            eq(schema.discoverComments.postId, input.postId),
            isNull(schema.discoverComments.deletedAt),
          ))
          .limit(1)
          .all();
        if (!parentRows[0]) throw new AppError(ErrorCode.PARAM_ERROR, '回复的评论不存在');
        parentAuthorUserId = parentRows[0].authorUserId;
      }

      const now = new Date();
      const inserted = tx.insert(schema.discoverComments).values({
        postId: input.postId,
        userId: input.userId,
        parentCommentId: input.parentCommentId,
        content: input.content,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }).returning({ id: schema.discoverComments.id }).all();
      const createdCommentId = inserted[0]?.id ?? null;
      if (!createdCommentId) throw new Error('Discover comment insert returned no id.');
      this.outbox.enqueue(tx, createCommentActivityEvents({
        actorUserId: input.userId,
        postAuthorUserId: postRows[0].authorUserId,
        parentCommentAuthorUserId: parentAuthorUserId,
        resourceType: 'discover_post',
        resourceId: input.postId,
        commentId: createdCommentId,
        createdAt: now,
      }));
      this.refreshPostCommentCount(tx, input.postId, now);
      return createdCommentId;
    });

    if (!createdCommentId) return null;
    const row = await this.findById(createdCommentId);
    if (!row) return null;
    return (await this.projectRows([row], input.userId))[0] ?? null;
  }

  async delete(commentId: number, userId: number) {
    return this.db.transaction((tx) => {
      const commentRows = tx.select({
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
        .limit(1)
        .all();
      const activeComment = commentRows[0];
      if (!activeComment) return null;

      const now = new Date();
      const updated = tx.update(schema.discoverComments)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.discoverComments.id, activeComment.id),
          eq(schema.discoverComments.userId, userId),
          eq(schema.discoverComments.postId, activeComment.postId),
          isNull(schema.discoverComments.deletedAt),
        ))
        .returning({ id: schema.discoverComments.id, postId: schema.discoverComments.postId })
        .all();
      if (!updated[0]) return null;

      this.outbox.removeSubresource(tx, 'discover_post', updated[0].postId, commentId);
      this.refreshPostCommentCount(tx, updated[0].postId, now);
      return updated[0];
    });
  }

  private async findById(commentId: number) {
    const rows = await this.db.select(commentSelect())
      .from(schema.discoverComments)
      .where(and(eq(schema.discoverComments.id, commentId), isNull(schema.discoverComments.deletedAt)))
      .limit(1);
    return rows[0] as DiscoverCommentRow | undefined;
  }

  private async projectRows(rows: DiscoverCommentRow[], viewerUserId: number) {
    const profiles = await this.profiles.getMany(rows.map((row) => row.userId));
    return rows.map((row) => toCommentResponse(
      row,
      viewerUserId,
      requireProfile(profiles, row.userId),
    ));
  }

  private refreshPostCommentCount(tx: DiscoverTransaction, postId: number, now: Date): void {
    const countRows = tx.select({ count: sql<number>`count(*)` })
      .from(schema.discoverComments)
      .where(and(eq(schema.discoverComments.postId, postId), isNull(schema.discoverComments.deletedAt)))
      .all();
    tx.update(schema.discoverPosts)
      .set({ commentCount: Number(countRows[0]?.count || 0), updatedAt: now })
      .where(eq(schema.discoverPosts.id, postId))
      .run();
  }
}
