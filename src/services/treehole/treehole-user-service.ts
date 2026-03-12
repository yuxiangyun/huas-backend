import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../../db';
import {
  clampCommentPageSize,
  clampPage,
  clampPageSize,
  commentSelect,
  type CreateTreeholeCommentInput,
  type CreateTreeholePostInput,
  findPublicPost,
  getLikedMap,
  getTreeholeMeta,
  normalizeCommentContent,
  normalizePostContent,
  postSelect,
  refreshPostCommentCount,
  refreshPostLikeCount,
  toCommentResponse,
  toPostListResponse,
  toPostResponse,
  type TreeholeCommentListResponse,
  type TreeholeCommentRow,
  type TreeholeListResponse,
  type TreeholePostResponse,
  type TreeholePostRow,
} from './treehole-shared';

export class TreeholeUserService {
  static getMeta() {
    return getTreeholeMeta();
  }

  static async listPosts(options: { userId: number; page?: number; pageSize?: number }): Promise<TreeholeListResponse> {
    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const whereExpr = isNull(schema.treeholePosts.deletedAt);
    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.treeholePosts)
      .where(whereExpr);
    const total = Number(totalRows[0]?.count || 0);
    const rows = await db.select(postSelect())
      .from(schema.treeholePosts)
      .where(whereExpr)
      .orderBy(desc(schema.treeholePosts.publishedAt), desc(schema.treeholePosts.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return toPostListResponse(rows as TreeholePostRow[], options.userId, page, pageSize, total);
  }

  static async listMyPosts(options: { userId: number; page?: number; pageSize?: number }): Promise<TreeholeListResponse> {
    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const whereExpr = and(
      eq(schema.treeholePosts.userId, options.userId),
      isNull(schema.treeholePosts.deletedAt),
    );
    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.treeholePosts)
      .where(whereExpr);
    const total = Number(totalRows[0]?.count || 0);
    const rows = await db.select(postSelect())
      .from(schema.treeholePosts)
      .where(whereExpr)
      .orderBy(desc(schema.treeholePosts.publishedAt), desc(schema.treeholePosts.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return toPostListResponse(rows as TreeholePostRow[], options.userId, page, pageSize, total);
  }

  static async createPost(input: CreateTreeholePostInput): Promise<TreeholePostResponse | null> {
    const content = normalizePostContent(input.content);
    const db = getDb();
    const now = new Date();
    const inserted = await db.insert(schema.treeholePosts).values({
      userId: input.userId,
      content,
      likeCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      deletedAt: null,
    }).returning({ id: schema.treeholePosts.id });

    return this.getPostDetail(input.userId, inserted[0].id);
  }

  static async getPostDetail(userId: number, postId: number): Promise<TreeholePostResponse | null> {
    const row = await findPublicPost(postId);
    if (!row) return null;

    const likedMap = await getLikedMap(userId, [postId]);
    return toPostResponse(row, userId, likedMap.has(postId));
  }

  static async likePost(userId: number, postId: number): Promise<TreeholePostResponse | null> {
    const db = getDb();
    const exists = await db.transaction(async (tx) => {
      const rows = await tx.select({ id: schema.treeholePosts.id })
        .from(schema.treeholePosts)
        .where(and(
          eq(schema.treeholePosts.id, postId),
          isNull(schema.treeholePosts.deletedAt),
        ))
        .limit(1);

      if (!rows[0]) return false;

      const now = new Date();
      await tx.insert(schema.treeholePostLikes).values({
        postId,
        userId,
        createdAt: now,
      }).onConflictDoNothing();

      await refreshPostLikeCount(tx, postId, now);
      return true;
    });

    if (!exists) return null;
    return this.getPostDetail(userId, postId);
  }

  static async unlikePost(userId: number, postId: number): Promise<TreeholePostResponse | null> {
    const db = getDb();
    const exists = await db.transaction(async (tx) => {
      const rows = await tx.select({ id: schema.treeholePosts.id })
        .from(schema.treeholePosts)
        .where(and(
          eq(schema.treeholePosts.id, postId),
          isNull(schema.treeholePosts.deletedAt),
        ))
        .limit(1);

      if (!rows[0]) return false;

      const now = new Date();
      await tx.delete(schema.treeholePostLikes).where(and(
        eq(schema.treeholePostLikes.postId, postId),
        eq(schema.treeholePostLikes.userId, userId),
      ));

      await refreshPostLikeCount(tx, postId, now);
      return true;
    });

    if (!exists) return null;
    return this.getPostDetail(userId, postId);
  }

  static async listComments(
    userId: number,
    postId: number,
    options: { page?: number; pageSize?: number }
  ): Promise<TreeholeCommentListResponse | null> {
    const post = await findPublicPost(postId);
    if (!post) return null;

    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampCommentPageSize(options.pageSize);
    const whereExpr = and(
      eq(schema.treeholeComments.postId, postId),
      isNull(schema.treeholeComments.deletedAt),
    );
    const totalRows = await db.select({ count: sql<number>`count(*)` })
      .from(schema.treeholeComments)
      .where(whereExpr);
    const total = Number(totalRows[0]?.count || 0);
    const rows = await db.select(commentSelect())
      .from(schema.treeholeComments)
      .where(whereExpr)
      .orderBy(asc(schema.treeholeComments.createdAt), asc(schema.treeholeComments.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: (rows as TreeholeCommentRow[]).map((row) => toCommentResponse(row, userId)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  static async createComment(input: CreateTreeholeCommentInput) {
    const content = normalizeCommentContent(input.content);
    const db = getDb();
    const created = await db.transaction(async (tx) => {
      const postRows = await tx.select({ id: schema.treeholePosts.id })
        .from(schema.treeholePosts)
        .where(and(
          eq(schema.treeholePosts.id, input.postId),
          isNull(schema.treeholePosts.deletedAt),
        ))
        .limit(1);

      if (!postRows[0]) return null;

      const now = new Date();
      const inserted = await tx.insert(schema.treeholeComments).values({
        postId: input.postId,
        userId: input.userId,
        content,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }).returning(commentSelect());

      await refreshPostCommentCount(tx, input.postId, now);
      return inserted[0] as TreeholeCommentRow;
    });

    return created ? toCommentResponse(created, input.userId) : null;
  }

  static async deletePost(postId: number, userId: number) {
    const db = getDb();
    const now = new Date();
    const updated = await db.update(schema.treeholePosts)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(schema.treeholePosts.id, postId),
        eq(schema.treeholePosts.userId, userId),
        isNull(schema.treeholePosts.deletedAt),
      ))
      .returning({ id: schema.treeholePosts.id });

    return updated[0] ? { id: updated[0].id } : null;
  }

  static async deleteComment(commentId: number, userId: number) {
    const db = getDb();
    return db.transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.update(schema.treeholeComments)
        .set({
          deletedAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(schema.treeholeComments.id, commentId),
          eq(schema.treeholeComments.userId, userId),
          isNull(schema.treeholeComments.deletedAt),
        ))
        .returning({
          id: schema.treeholeComments.id,
          postId: schema.treeholeComments.postId,
        });

      if (!updated[0]) return null;

      await refreshPostCommentCount(tx, updated[0].postId, now);
      return updated[0];
    });
  }
}
