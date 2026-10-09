/**
 * [INPUT]: 依赖 JWT 验证、db/schema 用户表、AnalyticsService、response/errors/logger 工具与 Hono Context
 * [OUTPUT]: 提供全局 userActivityMiddleware 与受保护路由 authMiddleware，共用一次用户识别
 * [POS]: middleware 的 Bearer 边界；有效用户请求立即单调更新活跃时间，公开路由保持可匿名访问
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { Context, Next } from 'hono';
import { and, eq, lt } from 'drizzle-orm';
import { verifyToken } from '../auth/jwt';
import { getDb, schema } from '../db';
import { error } from '../utils/response';
import { ErrorCode } from '../utils/errors';
import { Logger } from '../utils/logger';
import { AnalyticsService } from '../services/admin/analytics-service';

// Extend Hono context variables
declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    studentId: string;
    name?: string;
    userAuthenticationResolved: boolean;
  }
}

async function resolveRequestUser(c: Context): Promise<boolean> {
  if (c.get('userAuthenticationResolved')) return c.get('userId') !== undefined;
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    c.set('userAuthenticationResolved', true);
    return false;
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);

  if (!payload) {
    c.set('userAuthenticationResolved', true);
    return false;
  }

  const db = getDb();
  const exactUsers = await db
    .select({
      id: schema.users.id,
      studentId: schema.users.studentId,
      name: schema.users.name,
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
      })
      .from(schema.users)
      .where(eq(schema.users.studentId, payload.studentId))
      .limit(1);
    resolvedUser = byStudentId[0];
  }

  if (!resolvedUser) {
    c.set('userAuthenticationResolved', true);
    return false;
  }

  c.set('userId', resolvedUser.id);
  c.set('studentId', resolvedUser.studentId);
  const name = payload.name?.trim() || resolvedUser.name?.trim() || undefined;
  c.set('name', name);
  c.set('userAuthenticationResolved', true);
  return true;
}

export async function userActivityMiddleware(c: Context, next: Next) {
  const now = new Date();
  try {
    if (await resolveRequestUser(c)) {
      getDb().update(schema.users)
        .set({ lastActiveAt: now })
        .where(and(eq(schema.users.id, c.get('userId')), lt(schema.users.lastActiveAt, now)))
        .run();
    }
  } catch (touchError: unknown) {
    Logger.warn('AuthMiddleware', '记录用户请求活跃失败',
      touchError instanceof Error ? touchError.message : String(touchError));
  }
  await next();
}

export async function authMiddleware(c: Context, next: Next) {
  if (!await resolveRequestUser(c)) {
    return error(c, ErrorCode.JWT_INVALID, 'Invalid or expired token, please login again', 401);
  }
  await next();
  try {
    AnalyticsService.recordAuthenticatedRequest({
      userId: c.get('userId'),
      platformHeader: c.req.header('x-client-platform'),
      path: c.req.path,
      status: c.res.status,
    });
  } catch (analyticsError: any) {
    Logger.warn('Analytics', '记录请求指标失败', analyticsError?.message || String(analyticsError));
  }
}
