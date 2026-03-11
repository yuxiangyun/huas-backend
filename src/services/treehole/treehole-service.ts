import { and, asc, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import { config } from '../../config';
import { getDb, schema } from '../../db';
import { AppError, ErrorCode } from '../../utils/errors';
import { beijingIsoString } from '../../utils/time';

interface ListOptions {
  userId: number;
  page?: number;
  pageSize?: number;
}

interface CreateTreeholePostInput {
  userId: number;
  content: string;
}

interface CreateTreeholeCommentInput {
  userId: number;
  postId: number;
  content: string;
}

interface TreeholePostRow {
  id: number;
  userId: number;
  content: string;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date;
  deletedAt: Date | null;
}

interface TreeholeCommentRow {
  id: number;
  postId: number;
  userId: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface AdminTreeholePostRow extends TreeholePostRow {
  authorStudentId: string;
  authorName: string | null;
  authorClassName: string | null;
}

interface AdminTreeholeCommentRow extends TreeholeCommentRow {
  authorStudentId: string;
  authorName: string | null;
  authorClassName: string | null;
}

interface TreeholePostResponse {
  id: number;
  content: string;
  stats: {
    likeCount: number;
    commentCount: number;
  };
  viewer: {
    liked: boolean;
    isMine: boolean;
  };
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface TreeholeCommentResponse {
  id: number;
  postId: number;
  content: string;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AdminAuthorSummary {
  id: number;
  studentId: string;
  name: string;
  className: string;
}

interface AdminTreeholePostResponse {
  id: number;
  content: string;
  stats: {
    likeCount: number;
    commentCount: number;
  };
  author: AdminAuthorSummary;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminTreeholeCommentResponse {
  id: number;
  postId: number;
  content: string;
  author: AdminAuthorSummary;
  createdAt: string;
  updatedAt: string;
}

interface TreeholeListResponse {
  items: TreeholePostResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface TreeholeCommentListResponse {
  items: TreeholeCommentResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface AdminTreeholePostListResponse {
  summary: {
    totalPosts: number;
    totalComments: number;
    totalLikes: number;
  };
  items: AdminTreeholePostResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface AdminTreeholeCommentListResponse {
  items: AdminTreeholeCommentResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface AdminTreeholePostListOptions {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

interface AdminTreeholeCommentListOptions {
  page?: number;
  pageSize?: number;
}

function postSelect() {
  return {
    id: schema.treeholePosts.id,
    userId: schema.treeholePosts.userId,
    content: schema.treeholePosts.content,
    likeCount: schema.treeholePosts.likeCount,
    commentCount: schema.treeholePosts.commentCount,
    createdAt: schema.treeholePosts.createdAt,
    updatedAt: schema.treeholePosts.updatedAt,
    publishedAt: schema.treeholePosts.publishedAt,
    deletedAt: schema.treeholePosts.deletedAt,
  };
}

function adminPostSelect() {
  return {
    ...postSelect(),
    authorStudentId: schema.users.studentId,
    authorName: schema.users.name,
    authorClassName: schema.users.className,
  };
}

function commentSelect() {
  return {
    id: schema.treeholeComments.id,
    postId: schema.treeholeComments.postId,
    userId: schema.treeholeComments.userId,
    content: schema.treeholeComments.content,
    createdAt: schema.treeholeComments.createdAt,
    updatedAt: schema.treeholeComments.updatedAt,
    deletedAt: schema.treeholeComments.deletedAt,
  };
}

function adminCommentSelect() {
  return {
    ...commentSelect(),
    authorStudentId: schema.users.studentId,
    authorName: schema.users.name,
    authorClassName: schema.users.className,
  };
}

function clampPage(page: number | undefined) {
  if (!page || !Number.isFinite(page) || page <= 0) return 1;
  return Math.floor(page);
}

function clampPageSize(pageSize: number | undefined) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) {
    return config.treehole.defaultPageSize;
  }

  return Math.min(Math.floor(pageSize), config.treehole.maxPageSize);
}

function clampCommentPageSize(pageSize: number | undefined) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) {
    return config.treehole.defaultCommentPageSize;
  }

  return Math.min(Math.floor(pageSize), config.treehole.maxCommentPageSize);
}

function normalizePostContent(value: string) {
  const content = value.trim();
  if (!content) {
    throw new AppError(ErrorCode.PARAM_ERROR, '树洞内容不能为空');
  }
  if (content.length > config.treehole.maxPostLength) {
    throw new AppError(
      ErrorCode.PARAM_ERROR,
      `树洞内容不能超过 ${config.treehole.maxPostLength} 个字`
    );
  }
  return content;
}

function normalizeCommentContent(value: string) {
  const content = value.trim();
  if (!content) {
    throw new AppError(ErrorCode.PARAM_ERROR, '评论内容不能为空');
  }
  if (content.length > config.treehole.maxCommentLength) {
    throw new AppError(
      ErrorCode.PARAM_ERROR,
      `评论内容不能超过 ${config.treehole.maxCommentLength} 个字`
    );
  }
  return content;
}

function formatLikeKeyword(value: string) {
  return `%${value.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

function toAdminAuthorSummary(row: { userId: number; authorStudentId: string; authorName: string | null; authorClassName: string | null }): AdminAuthorSummary {
  return {
    id: row.userId,
    studentId: row.authorStudentId,
    name: row.authorName?.trim() || '',
    className: row.authorClassName?.trim() || '',
  };
}

function toPostResponse(row: TreeholePostRow, userId: number, liked: boolean): TreeholePostResponse {
  return {
    id: row.id,
    content: row.content,
    stats: {
      likeCount: row.likeCount,
      commentCount: row.commentCount,
    },
    viewer: {
      liked,
      isMine: row.userId === userId,
    },
    publishedAt: beijingIsoString(row.publishedAt),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

function toAdminPostResponse(row: AdminTreeholePostRow): AdminTreeholePostResponse {
  return {
    id: row.id,
    content: row.content,
    stats: {
      likeCount: row.likeCount,
      commentCount: row.commentCount,
    },
    author: toAdminAuthorSummary(row),
    publishedAt: beijingIsoString(row.publishedAt),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

function toCommentResponse(row: TreeholeCommentRow, userId: number): TreeholeCommentResponse {
  return {
    id: row.id,
    postId: row.postId,
    content: row.content,
    isMine: row.userId === userId,
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

function toAdminCommentResponse(row: AdminTreeholeCommentRow): AdminTreeholeCommentResponse {
  return {
    id: row.id,
    postId: row.postId,
    content: row.content,
    author: toAdminAuthorSummary(row),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export class TreeholeService {
  static getMeta() {
    return {
      limits: {
        maxPostLength: config.treehole.maxPostLength,
        maxCommentLength: config.treehole.maxCommentLength,
      },
      pagination: {
        defaultPageSize: config.treehole.defaultPageSize,
        maxPageSize: config.treehole.maxPageSize,
        defaultCommentPageSize: config.treehole.defaultCommentPageSize,
        maxCommentPageSize: config.treehole.maxCommentPageSize,
      },
    };
  }

  static async listPosts(options: ListOptions): Promise<TreeholeListResponse> {
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

    return this.toPostListResponse(rows as TreeholePostRow[], options.userId, page, pageSize, total);
  }

  static async listMyPosts(options: ListOptions): Promise<TreeholeListResponse> {
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

    return this.toPostListResponse(rows as TreeholePostRow[], options.userId, page, pageSize, total);
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
    const row = await this.findPublicPost(postId);
    if (!row) return null;

    const likedMap = await this.getLikedMap(userId, [postId]);
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

      await this.refreshPostLikeCount(tx, postId, now);
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

      await this.refreshPostLikeCount(tx, postId, now);
      return true;
    });

    if (!exists) return null;
    return this.getPostDetail(userId, postId);
  }

  static async listComments(
    userId: number,
    postId: number,
    options: Omit<ListOptions, 'userId'>
  ): Promise<TreeholeCommentListResponse | null> {
    const post = await this.findPublicPost(postId);
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

  static async createComment(input: CreateTreeholeCommentInput): Promise<TreeholeCommentResponse | null> {
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

      await this.refreshPostCommentCount(tx, input.postId, now);
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

      await this.refreshPostCommentCount(tx, updated[0].postId, now);
      return updated[0];
    });
  }

  static async adminListPosts(options: AdminTreeholePostListOptions): Promise<AdminTreeholePostListResponse> {
    const db = getDb();
    const page = clampPage(options.page);
    const pageSize = clampPageSize(options.pageSize);
    const keyword = options.keyword?.trim() || '';
    const whereParts = [isNull(schema.treeholePosts.deletedAt)];

    if (keyword) {
      const match = formatLikeKeyword(keyword);
      whereParts.push(or(
        like(schema.treeholePosts.content, match),
        like(schema.users.studentId, match),
        like(schema.users.name, match),
        like(schema.users.className, match),
      )!);
    }

    const whereExpr = and(...whereParts);
    const [
      totalRows,
      totalPostRows,
      totalCommentRows,
      totalLikeRows,
      rows,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholePosts)
        .innerJoin(schema.users, eq(schema.treeholePosts.userId, schema.users.id))
        .where(whereExpr),
      db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholePosts)
        .where(isNull(schema.treeholePosts.deletedAt)),
      db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholeComments)
        .innerJoin(schema.treeholePosts, eq(schema.treeholeComments.postId, schema.treeholePosts.id))
        .where(and(
          isNull(schema.treeholeComments.deletedAt),
          isNull(schema.treeholePosts.deletedAt),
        )),
      db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholePostLikes)
        .innerJoin(schema.treeholePosts, eq(schema.treeholePostLikes.postId, schema.treeholePosts.id))
        .where(isNull(schema.treeholePosts.deletedAt)),
      db.select(adminPostSelect())
        .from(schema.treeholePosts)
        .innerJoin(schema.users, eq(schema.treeholePosts.userId, schema.users.id))
        .where(whereExpr)
        .orderBy(desc(schema.treeholePosts.publishedAt), desc(schema.treeholePosts.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    const total = Number(totalRows[0]?.count || 0);

    return {
      summary: {
        totalPosts: Number(totalPostRows[0]?.count || 0),
        totalComments: Number(totalCommentRows[0]?.count || 0),
        totalLikes: Number(totalLikeRows[0]?.count || 0),
      },
      items: (rows as AdminTreeholePostRow[]).map(toAdminPostResponse),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  static async adminListComments(
    postId: number,
    options: AdminTreeholeCommentListOptions
  ): Promise<AdminTreeholeCommentListResponse | null> {
    const db = getDb();
    const postRows = await db.select({ id: schema.treeholePosts.id })
      .from(schema.treeholePosts)
      .where(and(
        eq(schema.treeholePosts.id, postId),
        isNull(schema.treeholePosts.deletedAt),
      ))
      .limit(1);

    if (!postRows[0]) return null;

    const page = clampPage(options.page);
    const pageSize = clampCommentPageSize(options.pageSize);
    const whereExpr = and(
      eq(schema.treeholeComments.postId, postId),
      isNull(schema.treeholeComments.deletedAt),
    );

    const [totalRows, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(schema.treeholeComments)
        .where(whereExpr),
      db.select(adminCommentSelect())
        .from(schema.treeholeComments)
        .innerJoin(schema.users, eq(schema.treeholeComments.userId, schema.users.id))
        .where(whereExpr)
        .orderBy(desc(schema.treeholeComments.createdAt), desc(schema.treeholeComments.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    const total = Number(totalRows[0]?.count || 0);
    return {
      items: (rows as AdminTreeholeCommentRow[]).map(toAdminCommentResponse),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  static async adminDeletePost(postId: number) {
    const db = getDb();
    const now = new Date();
    const updated = await db.update(schema.treeholePosts)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(schema.treeholePosts.id, postId),
        isNull(schema.treeholePosts.deletedAt),
      ))
      .returning({ id: schema.treeholePosts.id });

    return updated[0] ? { id: updated[0].id } : null;
  }

  static async adminDeleteComment(commentId: number) {
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
          isNull(schema.treeholeComments.deletedAt),
        ))
        .returning({
          id: schema.treeholeComments.id,
          postId: schema.treeholeComments.postId,
        });

      if (!updated[0]) return null;

      await this.refreshPostCommentCount(tx, updated[0].postId, now);
      return updated[0];
    });
  }

  private static async toPostListResponse(
    rows: TreeholePostRow[],
    userId: number,
    page: number,
    pageSize: number,
    total: number
  ): Promise<TreeholeListResponse> {
    const likedMap = await this.getLikedMap(userId, rows.map((row) => row.id));

    return {
      items: rows.map((row) => toPostResponse(row, userId, likedMap.has(row.id))),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  private static async findPublicPost(postId: number): Promise<TreeholePostRow | null> {
    const db = getDb();
    const rows = await db.select(postSelect())
      .from(schema.treeholePosts)
      .where(and(
        eq(schema.treeholePosts.id, postId),
        isNull(schema.treeholePosts.deletedAt),
      ))
      .limit(1);

    return (rows[0] as TreeholePostRow | undefined) ?? null;
  }

  private static async getLikedMap(userId: number, postIds: number[]) {
    if (postIds.length === 0) return new Map<number, true>();

    const db = getDb();
    const rows = await db.select({ postId: schema.treeholePostLikes.postId })
      .from(schema.treeholePostLikes)
      .where(and(
        eq(schema.treeholePostLikes.userId, userId),
        inArray(schema.treeholePostLikes.postId, postIds),
      ));

    return new Map(rows.map((row) => [row.postId, true] as const));
  }

  private static async refreshPostLikeCount(tx: any, postId: number, now: Date) {
    const countRows = await tx.select({ count: sql<number>`count(*)` })
      .from(schema.treeholePostLikes)
      .where(eq(schema.treeholePostLikes.postId, postId));

    await tx.update(schema.treeholePosts)
      .set({
        likeCount: Number(countRows[0]?.count || 0),
        updatedAt: now,
      })
      .where(eq(schema.treeholePosts.id, postId));
  }

  private static async refreshPostCommentCount(tx: any, postId: number, now: Date) {
    const countRows = await tx.select({ count: sql<number>`count(*)` })
      .from(schema.treeholeComments)
      .where(and(
        eq(schema.treeholeComments.postId, postId),
        isNull(schema.treeholeComments.deletedAt),
      ));

    await tx.update(schema.treeholePosts)
      .set({
        commentCount: Number(countRows[0]?.count || 0),
        updatedAt: now,
      })
      .where(eq(schema.treeholePosts.id, postId));
  }
}
