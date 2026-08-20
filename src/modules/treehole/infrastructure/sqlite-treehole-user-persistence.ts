/**
 * [INPUT]: 依赖构造注入的 Drizzle db、CommunityProfileReader、TreeholeMediaReader、ActivityOutboxWriter、Treehole schema 与模块内 SQL helpers
 * [OUTPUT]: 对 SQLiteTreeholePersistence 提供含图片元数据的帖子、用户帖子、允许自赞的幂等点赞、差异回复通知与删除时同事务撤回互动事件的事务
 * [POS]: modules/treehole/infrastructure 的用户侧事实 adapter，共享父作者 reply/帖子作者 comment 规则，写互动与撤回均与 Outbox 同事务，图片文件副作用留给 application 补偿
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { schema } from '../../../db';
import { AppError, ErrorCode } from '../../../utils/errors';
import type { CommunityProfileReader } from '../../community/domain/ports';
import { createActivityEvents, createCommentActivityEvents } from '../../notifications/domain/activity';
import type { ActivityOutboxWriter } from '../../notifications/domain/ports';
import type { TreeholeMediaReader } from '../domain/ports';
import {
  toCommentResponse,
  toPostResponse,
  type PersistTreeholeCommentInput,
  type TreeholeCommentListResponse,
  type TreeholeCommentRow,
  type TreeholeListResponse,
  type TreeholePostResponse,
  type TreeholePostRow,
  type StoredTreeholeMedia,
} from '../domain/treehole';
import {
  commentSelect,
  findPublicPost,
  getLikedMap,
  postSelect,
  refreshPostCommentCount,
  refreshPostLikeCount,
  requireCommunityProfile,
  toPostListResponse,
  type TreeholeDatabase,
  type TreeholeTransaction,
  uniqueUserIds,
} from './sqlite-treehole-support';

export class SQLiteTreeholeUserPersistence {
  constructor(
    private readonly db: TreeholeDatabase,
    private readonly profiles: CommunityProfileReader,
    private readonly media: TreeholeMediaReader,
    private readonly outbox: ActivityOutboxWriter<TreeholeTransaction>,
  ) {}

  async listPosts(options: { userId: number; page: number; pageSize: number }): Promise<TreeholeListResponse> {
    const { page, pageSize } = options;
    const whereExpr = isNull(schema.treeholePosts.deletedAt);
    const [totalRows, rows] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholePosts)
        .where(whereExpr),
      this.db.select(postSelect())
        .from(schema.treeholePosts)
        .where(whereExpr)
        .orderBy(desc(schema.treeholePosts.publishedAt), desc(schema.treeholePosts.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    const total = Number(totalRows[0]?.count || 0);
    return toPostListResponse(
      this.db,
      this.profiles,
      this.media,
      rows as TreeholePostRow[],
      options.userId,
      page,
      pageSize,
      total,
    );
  }

  async listUserPosts(options: {
    viewerUserId: number;
    authorUserId: number;
    page: number;
    pageSize: number;
  }): Promise<TreeholeListResponse> {
    const { page, pageSize } = options;
    const whereExpr = and(
      eq(schema.treeholePosts.userId, options.authorUserId),
      isNull(schema.treeholePosts.deletedAt),
    );
    const [totalRows, rows] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholePosts)
        .where(whereExpr),
      this.db.select(postSelect())
        .from(schema.treeholePosts)
        .where(whereExpr)
        .orderBy(desc(schema.treeholePosts.publishedAt), desc(schema.treeholePosts.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    const total = Number(totalRows[0]?.count || 0);
    return toPostListResponse(
      this.db,
      this.profiles,
      this.media,
      rows as TreeholePostRow[],
      options.viewerUserId,
      page,
      pageSize,
      total,
    );
  }

  async createPost(input: {
    userId: number;
    content: string;
    media: StoredTreeholeMedia | null;
  }): Promise<number> {
    const now = new Date();
    const inserted = await this.db.insert(schema.treeholePosts).values({
      userId: input.userId,
      content: input.content,
      mediaKey: input.media?.mediaKey ?? null,
      imagesJson: JSON.stringify(input.media?.images ?? []),
      likeCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      deletedAt: null,
    }).returning({ id: schema.treeholePosts.id });

    return inserted[0]!.id;
  }

  async getPostDetail(userId: number, postId: number): Promise<TreeholePostResponse | null> {
    const row = await findPublicPost(this.db, postId);
    if (!row) return null;

    const [likedMap, profileMap] = await Promise.all([
      getLikedMap(this.db, userId, [postId]),
      this.profiles.getMany([row.userId]),
    ]);
    return toPostResponse(
      row,
      userId,
      likedMap.has(postId),
      requireCommunityProfile(profileMap, row.userId),
      (mediaKey, fileName) => this.media.userUrlFor(mediaKey, fileName),
    );
  }

  async likePost(userId: number, postId: number): Promise<TreeholePostResponse | null> {
    const exists = this.db.transaction((tx) => {
      const rows = tx.select({
        id: schema.treeholePosts.id,
        authorUserId: schema.treeholePosts.userId,
      })
        .from(schema.treeholePosts)
        .where(and(
          eq(schema.treeholePosts.id, postId),
          isNull(schema.treeholePosts.deletedAt),
        ))
        .limit(1)
        .all();

      if (!rows[0]) return false;
      const now = new Date();
      const events = createActivityEvents({
        actorUserId: userId,
        recipientUserIds: [rows[0].authorUserId],
        type: 'treehole_like',
        resourceType: 'treehole_post',
        resourceId: postId,
        createdAt: now,
      });
      const inserted = tx.insert(schema.treeholePostLikes).values({
        postId,
        userId,
        createdAt: now,
      }).onConflictDoNothing().returning({ id: schema.treeholePostLikes.id }).all();
      if (inserted.length > 0) this.outbox.enqueue(tx, events);

      refreshPostLikeCount(tx, postId, now);
      return true;
    });

    return exists ? this.getPostDetail(userId, postId) : null;
  }

  async unlikePost(userId: number, postId: number): Promise<TreeholePostResponse | null> {
    const exists = this.db.transaction((tx) => {
      const rows = tx.select({
        id: schema.treeholePosts.id,
        authorUserId: schema.treeholePosts.userId,
      })
        .from(schema.treeholePosts)
        .where(and(
          eq(schema.treeholePosts.id, postId),
          isNull(schema.treeholePosts.deletedAt),
        ))
        .limit(1)
        .all();

      if (!rows[0]) return false;

      const now = new Date();
      const removed = tx.delete(schema.treeholePostLikes).where(and(
        eq(schema.treeholePostLikes.postId, postId),
        eq(schema.treeholePostLikes.userId, userId),
      )).returning({ id: schema.treeholePostLikes.id }).all();
      if (removed.length > 0) {
        const event = createActivityEvents({
          actorUserId: userId,
          recipientUserIds: [rows[0].authorUserId],
          type: 'treehole_like',
          resourceType: 'treehole_post',
          resourceId: postId,
          createdAt: now,
        })[0];
        if (event) this.outbox.removeLike(tx, event.eventId);
      }
      refreshPostLikeCount(tx, postId, now);
      return true;
    });

    return exists ? this.getPostDetail(userId, postId) : null;
  }

  async listComments(
    userId: number,
    postId: number,
    options: { page: number; pageSize: number },
  ): Promise<TreeholeCommentListResponse | null> {
    if (!(await findPublicPost(this.db, postId))) return null;

    const { page, pageSize } = options;
    const whereExpr = and(
      eq(schema.treeholeComments.postId, postId),
      isNull(schema.treeholeComments.deletedAt),
    );
    const [totalRows, rows] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholeComments)
        .where(whereExpr),
      this.db.select(commentSelect())
        .from(schema.treeholeComments)
        .where(whereExpr)
        .orderBy(asc(schema.treeholeComments.createdAt), asc(schema.treeholeComments.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    const typedRows = rows as TreeholeCommentRow[];
    const profileMap = await this.profiles.getMany(uniqueUserIds(typedRows));
    const total = Number(totalRows[0]?.count || 0);

    return {
      items: typedRows.map((row) => toCommentResponse(
        row,
        userId,
        requireCommunityProfile(profileMap, row.userId),
      )),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  async createComment(input: PersistTreeholeCommentInput) {
    const created = this.db.transaction((tx) => {
      const postRows = tx.select({
        id: schema.treeholePosts.id,
        authorUserId: schema.treeholePosts.userId,
      })
        .from(schema.treeholePosts)
        .where(and(
          eq(schema.treeholePosts.id, input.postId),
          isNull(schema.treeholePosts.deletedAt),
        ))
        .limit(1)
        .all();
      if (!postRows[0]) return null;

      let parentAuthorUserId: number | null = null;
      if (input.parentCommentId !== null) {
        const parentRows = tx.select({
          id: schema.treeholeComments.id,
          authorUserId: schema.treeholeComments.userId,
        })
          .from(schema.treeholeComments)
          .where(and(
            eq(schema.treeholeComments.id, input.parentCommentId),
            eq(schema.treeholeComments.postId, input.postId),
            isNull(schema.treeholeComments.deletedAt),
          ))
          .limit(1)
          .all();
        if (!parentRows[0]) throw new AppError(ErrorCode.PARAM_ERROR, '回复的评论不存在');
        parentAuthorUserId = parentRows[0].authorUserId;
      }

      const now = new Date();
      const inserted = tx.insert(schema.treeholeComments).values({
        postId: input.postId,
        userId: input.userId,
        parentCommentId: input.parentCommentId,
        content: input.content,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }).returning(commentSelect()).all();
      const created = inserted[0] as TreeholeCommentRow | undefined;
      if (!created) throw new Error('Treehole comment insert returned no row.');
      this.outbox.enqueue(tx, createCommentActivityEvents({
        actorUserId: input.userId,
        postAuthorUserId: postRows[0].authorUserId,
        parentCommentAuthorUserId: parentAuthorUserId,
        resourceType: 'treehole_post',
        resourceId: input.postId,
        commentId: created.id,
        createdAt: now,
      }));
      refreshPostCommentCount(tx, input.postId, now);
      return created;
    });

    if (!created) return null;
    const profileMap = await this.profiles.getMany([created.userId]);
    return toCommentResponse(
      created,
      input.userId,
      requireCommunityProfile(profileMap, created.userId),
    );
  }

  async deletePost(postId: number, userId: number) {
    return this.db.transaction((tx) => {
      const now = new Date();
      const updated = tx.update(schema.treeholePosts)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.treeholePosts.id, postId),
          eq(schema.treeholePosts.userId, userId),
          isNull(schema.treeholePosts.deletedAt),
        ))
        .returning({
          id: schema.treeholePosts.id,
          mediaKey: schema.treeholePosts.mediaKey,
        })
        .all();
      if (!updated[0]) return null;

      this.outbox.removeResource(tx, 'treehole_post', postId);
      return updated[0];
    });
  }

  async deleteComment(commentId: number, userId: number) {
    return this.db.transaction((tx) => {
      const now = new Date();
      const updated = tx.update(schema.treeholeComments)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.treeholeComments.id, commentId),
          eq(schema.treeholeComments.userId, userId),
          isNull(schema.treeholeComments.deletedAt),
        ))
        .returning({
          id: schema.treeholeComments.id,
          postId: schema.treeholeComments.postId,
        })
        .all();
      if (!updated[0]) return null;

      this.outbox.removeSubresource(tx, 'treehole_post', updated[0].postId, commentId);
      refreshPostCommentCount(tx, updated[0].postId, now);
      return updated[0];
    });
  }
}
