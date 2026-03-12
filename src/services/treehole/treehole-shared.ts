import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { config } from '../../config';
import { getDb, schema } from '../../db';
import { AppError, ErrorCode } from '../../utils/errors';
import { beijingIsoString } from '../../utils/time';

export interface ListOptions {
  userId: number;
  page?: number;
  pageSize?: number;
}

export interface CreateTreeholePostInput {
  userId: number;
  content: string;
}

export interface CreateTreeholeCommentInput {
  userId: number;
  postId: number;
  content: string;
}

export interface TreeholePostRow {
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

export interface TreeholeCommentRow {
  id: number;
  postId: number;
  userId: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AdminTreeholePostRow extends TreeholePostRow {
  authorStudentId: string;
  authorName: string | null;
  authorClassName: string | null;
}

export interface AdminTreeholeCommentRow extends TreeholeCommentRow {
  authorStudentId: string;
  authorName: string | null;
  authorClassName: string | null;
}

export interface TreeholePostResponse {
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

export interface TreeholeCommentResponse {
  id: number;
  postId: number;
  content: string;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuthorSummary {
  id: number;
  studentId: string;
  name: string;
  className: string;
}

export interface AdminTreeholePostResponse {
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

export interface AdminTreeholeCommentResponse {
  id: number;
  postId: number;
  content: string;
  author: AdminAuthorSummary;
  createdAt: string;
  updatedAt: string;
}

export interface TreeholeListResponse {
  items: TreeholePostResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface TreeholeCommentListResponse {
  items: TreeholeCommentResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface AdminTreeholePostListResponse {
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

export interface AdminTreeholeCommentListResponse {
  items: AdminTreeholeCommentResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface AdminTreeholePostListOptions {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface AdminTreeholeCommentListOptions {
  page?: number;
  pageSize?: number;
}

export function getTreeholeMeta() {
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

export function postSelect() {
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

export function adminPostSelect() {
  return {
    ...postSelect(),
    authorStudentId: schema.users.studentId,
    authorName: schema.users.name,
    authorClassName: schema.users.className,
  };
}

export function commentSelect() {
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

export function adminCommentSelect() {
  return {
    ...commentSelect(),
    authorStudentId: schema.users.studentId,
    authorName: schema.users.name,
    authorClassName: schema.users.className,
  };
}

export function clampPage(page: number | undefined) {
  if (!page || !Number.isFinite(page) || page <= 0) return 1;
  return Math.floor(page);
}

export function clampPageSize(pageSize: number | undefined) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) {
    return config.treehole.defaultPageSize;
  }

  return Math.min(Math.floor(pageSize), config.treehole.maxPageSize);
}

export function clampCommentPageSize(pageSize: number | undefined) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) {
    return config.treehole.defaultCommentPageSize;
  }

  return Math.min(Math.floor(pageSize), config.treehole.maxCommentPageSize);
}

export function normalizePostContent(value: string) {
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

export function normalizeCommentContent(value: string) {
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

export function formatLikeKeyword(value: string) {
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

export function toPostResponse(row: TreeholePostRow, userId: number, liked: boolean): TreeholePostResponse {
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

export function toAdminPostResponse(row: AdminTreeholePostRow): AdminTreeholePostResponse {
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

export function toCommentResponse(row: TreeholeCommentRow, userId: number): TreeholeCommentResponse {
  return {
    id: row.id,
    postId: row.postId,
    content: row.content,
    isMine: row.userId === userId,
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export function toAdminCommentResponse(row: AdminTreeholeCommentRow): AdminTreeholeCommentResponse {
  return {
    id: row.id,
    postId: row.postId,
    content: row.content,
    author: toAdminAuthorSummary(row),
    createdAt: beijingIsoString(row.createdAt),
    updatedAt: beijingIsoString(row.updatedAt),
  };
}

export async function findPublicPost(postId: number): Promise<TreeholePostRow | null> {
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

export async function getLikedMap(userId: number, postIds: number[]) {
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

export async function toPostListResponse(
  rows: TreeholePostRow[],
  userId: number,
  page: number,
  pageSize: number,
  total: number
): Promise<TreeholeListResponse> {
  const likedMap = await getLikedMap(userId, rows.map((row) => row.id));

  return {
    items: rows.map((row) => toPostResponse(row, userId, likedMap.has(row.id))),
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  };
}

export async function refreshPostLikeCount(tx: any, postId: number, now: Date) {
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

export async function refreshPostCommentCount(tx: any, postId: number, now: Date) {
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
