/**
 * [INPUT]: 依赖 Drizzle schema/getDb 与 Treehole domain 映射，不依赖 application 或旧 Facade
 * [OUTPUT]: 对 SQLite adapter 提供选择器、匿名头像/点赞批量查询、列表映射与计数刷新 helper
 * [POS]: modules/treehole/infrastructure 的 Treehole 专属 SQL 支撑层，不与 Discover 共享数据库抽象
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import {
  toPostResponse,
  type TreeholeListResponse,
  type TreeholePostRow,
} from '../domain/treehole';

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
    parentCommentId: schema.treeholeComments.parentCommentId,
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

export async function findPublicPost(postId: number): Promise<TreeholePostRow | null> {
  const db = getDb();
  const rows = await db.select(postSelect())
    .from(schema.treeholePosts)
    .where(and(eq(schema.treeholePosts.id, postId), isNull(schema.treeholePosts.deletedAt)))
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

export async function getTreeholeAvatarMap(userIds: number[]) {
  const uniqueUserIds = Array.from(new Set(
    userIds.filter((userId) => Number.isInteger(userId) && userId > 0),
  ));
  if (uniqueUserIds.length === 0) return new Map<number, string | null>();
  const db = getDb();
  const rows = await db.select({ id: schema.users.id, avatarUrl: schema.users.treeholeAvatarUrl })
    .from(schema.users)
    .where(inArray(schema.users.id, uniqueUserIds));
  return new Map(rows.map((row) => [row.id, row.avatarUrl || null] as const));
}

export async function toPostListResponse(
  rows: TreeholePostRow[],
  userId: number,
  page: number,
  pageSize: number,
  total: number,
): Promise<TreeholeListResponse> {
  const likedMap = await getLikedMap(userId, rows.map((row) => row.id));
  const avatarMap = await getTreeholeAvatarMap(rows.map((row) => row.userId));
  return {
    items: rows.map((row) =>
      toPostResponse(row, userId, likedMap.has(row.id), avatarMap.get(row.userId) || null)),
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
    .set({ likeCount: Number(countRows[0]?.count || 0), updatedAt: now })
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
    .set({ commentCount: Number(countRows[0]?.count || 0), updatedAt: now })
    .where(eq(schema.treeholePosts.id, postId));
}
