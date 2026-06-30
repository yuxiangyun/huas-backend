/**
 * [INPUT]: 依赖 JWT 验证、db/schema 用户表、response/errors/logger/time 工具与 Hono Context
 * [OUTPUT]: 对外提供 authMiddleware，并扩展 Hono ContextVariableMap 的 userId/studentId/name
 * [POS]: middleware 的 Bearer 认证边界，解析本服务 JWT、恢复用户身份并节流刷新 lastActiveAt
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { Context, Next } from 'hono';
import { and, eq } from 'drizzle-orm';
import { verifyToken } from '../auth/jwt';
import { getDb, schema } from '../db';
import { error } from '../utils/response';
import { ErrorCode } from '../utils/errors';
import { Logger } from '../utils/logger';
import { beijingDate } from '../utils/time';

const ACTIVITY_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

// Extend Hono context variables
declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    studentId: string;
    name?: string;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return error(c, ErrorCode.JWT_INVALID, 'Missing or invalid Authorization header', 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);

  if (!payload) {
    return error(c, ErrorCode.JWT_INVALID, 'Invalid or expired token', 401);
  }

  const db = getDb();
  const exactUsers = await db
    .select({
      id: schema.users.id,
      studentId: schema.users.studentId,
      name: schema.users.name,
      lastActiveAt: schema.users.lastActiveAt,
    })
    .from(schema.users)
    .where(and(
      eq(schema.users.id, payload.userId),
      eq(schema.users.studentId, payload.studentId)
    ))
    .limit(1);

  let resolvedUser = exactUsers[0];
  if (!resolvedUser) {
    // JWT may carry a stale userId after DB reset/restore; recover by stable studentId.
    const byStudentId = await db
      .select({
        id: schema.users.id,
        studentId: schema.users.studentId,
        name: schema.users.name,
        lastActiveAt: schema.users.lastActiveAt,
      })
      .from(schema.users)
      .where(eq(schema.users.studentId, payload.studentId))
      .limit(1);
    resolvedUser = byStudentId[0];
  }

  if (!resolvedUser) {
    return error(c, ErrorCode.JWT_INVALID, 'User no longer exists, please login again', 401);
  }

  c.set('userId', resolvedUser.id);
  c.set('studentId', resolvedUser.studentId);
  const name = payload.name?.trim() || resolvedUser.name?.trim() || undefined;
  c.set('name', name);

  const now = new Date();
  const crossedBeijingDay = resolvedUser.lastActiveAt
    ? beijingDate(resolvedUser.lastActiveAt) !== beijingDate(now)
    : false;
  const shouldTouchActivity = !resolvedUser.lastActiveAt
    || crossedBeijingDay
    || now.getTime() - resolvedUser.lastActiveAt.getTime() >= ACTIVITY_TOUCH_INTERVAL_MS;

  if (shouldTouchActivity) {
    try {
      await db.update(schema.users)
        .set({ lastActiveAt: now })
        .where(eq(schema.users.id, resolvedUser.id));
    } catch (touchError: any) {
      Logger.warn(
        'AuthMiddleware',
        '更新用户活跃时间失败',
        touchError?.message || String(touchError),
        resolvedUser.studentId
      );
    }
  }

  await next();
}
