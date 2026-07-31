/**
 * [INPUT]: 依赖构造方传入的 Drizzle db、CommunityProfileReader、Treehole schema 与领域映射
 * [OUTPUT]: 对 SQLite adapters 提供数据库/事务类型、事实选择器、批量点赞/作者投影、列表映射与计数刷新 helper
 * [POS]: modules/treehole/infrastructure 的无全局状态 SQL 支撑层，禁止读取 users/community_profiles
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema } from '../../../db';
import type { getDb } from '../../../db';
import { AppError, ErrorCode } from '../../../utils/errors';
import type { CommunityProfile } from '../../community/domain/community';
import type { CommunityProfileReader } from '../../community/domain/ports';
import {
  toPostResponse,
  type TreeholeListResponse,
  type TreeholePostRow,
} from '../domain/treehole';

export type TreeholeDatabase = ReturnType<typeof getDb>;
export type TreeholeTransaction = Parameters<Parameters<TreeholeDatabase['transaction']>[0]>[0];

export function uniqueUserIds(rows: ReadonlyArray<{ userId: number }>) {
  return Array.from(new Set(rows.map((row) => row.userId)));
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

export async function findPublicPost(db: TreeholeDatabase, postId: number): Promise<TreeholePostRow | null> {
  const rows = await db.select(postSelect())
    .from(schema.treeholePosts)
    .where(and(eq(schema.treeholePosts.id, postId), isNull(schema.treeholePosts.deletedAt)))
    .limit(1);
  return (rows[0] as TreeholePostRow | undefined) ?? null;
}

export async function getLikedMap(db: TreeholeDatabase, userId: number, postIds: number[]) {
  if (postIds.length === 0) return new Map<number, true>();
  const rows = await db.select({ postId: schema.treeholePostLikes.postId })
    .from(schema.treeholePostLikes)
    .where(and(
      eq(schema.treeholePostLikes.userId, userId),
      inArray(schema.treeholePostLikes.postId, postIds),
    ));
  return new Map(rows.map((row) => [row.postId, true] as const));
}

export function requireCommunityProfile(
  profiles: ReadonlyMap<number, CommunityProfile>,
  userId: number,
) {
  const profile = profiles.get(userId);
  if (!profile) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, `Treehole 作者资料不可用 userId=${userId}`);
  }
  return profile;
}

export async function toPostListResponse(
  db: TreeholeDatabase,
  profileReader: CommunityProfileReader,
  rows: TreeholePostRow[],
  userId: number,
  page: number,
  pageSize: number,
  total: number,
): Promise<TreeholeListResponse> {
  const [likedMap, profileMap] = await Promise.all([
    getLikedMap(db, userId, rows.map((row) => row.id)),
    profileReader.getMany(uniqueUserIds(rows)),
  ]);
  return {
    items: rows.map((row) => toPostResponse(
      row,
      userId,
      likedMap.has(row.id),
      requireCommunityProfile(profileMap, row.userId),
    )),
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  };
}

export function refreshPostLikeCount(tx: TreeholeTransaction, postId: number, now: Date): void {
  const countRows = tx.select({ count: sql<number>`count(*)` })
    .from(schema.treeholePostLikes)
    .where(eq(schema.treeholePostLikes.postId, postId))
    .all();
  tx.update(schema.treeholePosts)
    .set({ likeCount: Number(countRows[0]?.count || 0), updatedAt: now })
    .where(eq(schema.treeholePosts.id, postId))
    .run();
}

export function refreshPostCommentCount(tx: TreeholeTransaction, postId: number, now: Date): void {
  const countRows = tx.select({ count: sql<number>`count(*)` })
    .from(schema.treeholeComments)
    .where(and(
      eq(schema.treeholeComments.postId, postId),
      isNull(schema.treeholeComments.deletedAt),
    ))
    .all();
  tx.update(schema.treeholePosts)
    .set({ commentCount: Number(countRows[0]?.count || 0), updatedAt: now })
    .where(eq(schema.treeholePosts.id, postId))
    .run();
}
