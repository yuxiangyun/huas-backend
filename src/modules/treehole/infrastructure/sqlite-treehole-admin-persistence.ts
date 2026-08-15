/**
 * [INPUT]: 依赖构造注入的 Drizzle db、CommunityProfileReader、TreeholeMediaReader、Treehole schema 与模块内 SQL helpers
 * [OUTPUT]: 提供含管理图片 URL 的帖子/评论公共作者查询及返回媒体键、同事务撤回互动通知的软删除事务
 * [POS]: modules/treehole/infrastructure 的管理 adapter，只读内容事实并批量投影公共作者，删除与 Outbox 撤回同事务，图片文件副作用留给 application 补偿
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { schema } from '../../../db';
import type { CommunityProfileReader } from '../../community/domain/ports';
import type { ActivityOutboxWriter } from '../../notifications/domain/ports';
import type { TreeholeMediaReader } from '../domain/ports';
import {
  formatLikeKeyword,
  toAdminCommentResponse,
  toAdminPostResponse,
  type AdminTreeholeCommentListOptions,
  type AdminTreeholeCommentListResponse,
  type AdminTreeholePostListOptions,
  type AdminTreeholePostListResponse,
  type TreeholeCommentRow,
  type TreeholePostRow,
} from '../domain/treehole';
import {
  commentSelect,
  postSelect,
  refreshPostCommentCount,
  requireCommunityProfile,
  type TreeholeDatabase,
  type TreeholeTransaction,
  uniqueUserIds,
} from './sqlite-treehole-support';

export class SQLiteTreeholeAdminPersistence {
  constructor(
    private readonly db: TreeholeDatabase,
    private readonly profiles: CommunityProfileReader,
    private readonly media: TreeholeMediaReader,
    private readonly outbox?: ActivityOutboxWriter<TreeholeTransaction>,
  ) {}

  async listPosts(
    options: AdminTreeholePostListOptions & { page: number; pageSize: number },
  ): Promise<AdminTreeholePostListResponse> {
    const { page, pageSize } = options;
    const keyword = options.keyword?.trim() || '';
    const whereExpr = keyword
      ? and(
        isNull(schema.treeholePosts.deletedAt),
        sql`${schema.treeholePosts.content} LIKE ${formatLikeKeyword(keyword)} ESCAPE '\\'`,
      )
      : isNull(schema.treeholePosts.deletedAt);

    const [totalRows, totalPostRows, totalCommentRows, totalLikeRows, rows] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholePosts)
        .where(whereExpr),
      this.db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholePosts)
        .where(isNull(schema.treeholePosts.deletedAt)),
      this.db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholeComments)
        .innerJoin(schema.treeholePosts, eq(schema.treeholeComments.postId, schema.treeholePosts.id))
        .where(and(
          isNull(schema.treeholeComments.deletedAt),
          isNull(schema.treeholePosts.deletedAt),
        )),
      this.db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholePostLikes)
        .innerJoin(schema.treeholePosts, eq(schema.treeholePostLikes.postId, schema.treeholePosts.id))
        .where(isNull(schema.treeholePosts.deletedAt)),
      this.db.select(postSelect())
        .from(schema.treeholePosts)
        .where(whereExpr)
        .orderBy(desc(schema.treeholePosts.publishedAt), desc(schema.treeholePosts.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    const typedRows = rows as TreeholePostRow[];
    const profileMap = await this.profiles.getMany(uniqueUserIds(typedRows));
    const total = Number(totalRows[0]?.count || 0);

    return {
      summary: {
        totalPosts: Number(totalPostRows[0]?.count || 0),
        totalComments: Number(totalCommentRows[0]?.count || 0),
        totalLikes: Number(totalLikeRows[0]?.count || 0),
      },
      items: typedRows.map((row) => toAdminPostResponse(
        row,
        requireCommunityProfile(profileMap, row.userId),
        (mediaKey, fileName) => this.media.adminUrlFor(mediaKey, fileName),
      )),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  async listComments(
    postId: number,
    options: AdminTreeholeCommentListOptions & { page: number; pageSize: number },
  ): Promise<AdminTreeholeCommentListResponse | null> {
    const postRows = await this.db.select({ id: schema.treeholePosts.id })
      .from(schema.treeholePosts)
      .where(and(
        eq(schema.treeholePosts.id, postId),
        isNull(schema.treeholePosts.deletedAt),
      ))
      .limit(1);
    if (!postRows[0]) return null;

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
        .orderBy(desc(schema.treeholeComments.createdAt), desc(schema.treeholeComments.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    const typedRows = rows as TreeholeCommentRow[];
    const profileMap = await this.profiles.getMany(uniqueUserIds(typedRows));
    const total = Number(totalRows[0]?.count || 0);

    return {
      items: typedRows.map((row) => toAdminCommentResponse(
        row,
        requireCommunityProfile(profileMap, row.userId),
      )),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  async deletePost(postId: number) {
    return this.db.transaction((tx) => {
      if (!this.outbox) throw new Error('Treehole admin deletion requires an activity outbox writer.');
      const now = new Date();
      const updated = tx.update(schema.treeholePosts)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.treeholePosts.id, postId),
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

  async deleteComment(commentId: number) {
    return this.db.transaction((tx) => {
      if (!this.outbox) throw new Error('Treehole admin deletion requires an activity outbox writer.');
      const now = new Date();
      const updated = tx.update(schema.treeholeComments)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.treeholeComments.id, commentId),
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
