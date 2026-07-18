/**
 * [INPUT]: 依赖 Hono Context/Next、ErrorCode 与 response.error，读取认证后的 userId 和 refresh 查询参数
 * [OUTPUT]: 对外提供 academicRefreshRateLimitMiddleware 与测试态重置函数
 * [POS]: middleware 的教务强制刷新限流边界，以用户为粒度保护学校上游，不承载业务事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { Context, Next } from 'hono';
import { ErrorCode } from '../utils/errors';
import { error } from '../utils/response';

const ACADEMIC_REFRESH_WINDOW_MS = 5 * 1000;
const ACADEMIC_REFRESH_MAX_REQUESTS = 5;
const STALE_ENTRY_TTL_MS = ACADEMIC_REFRESH_WINDOW_MS * 3;

type RateLimitEntry = {
  count: number;
  touchedAt: number;
  windowStart: number;
};

const academicRefreshState = new Map<number, RateLimitEntry>();
let lastCleanupAt = 0;

function cleanupStaleEntries(now: number) {
  if (now - lastCleanupAt < STALE_ENTRY_TTL_MS) return;

  for (const [userId, entry] of academicRefreshState) {
    if (now - entry.touchedAt >= STALE_ENTRY_TTL_MS) {
      academicRefreshState.delete(userId);
    }
  }

  lastCleanupAt = now;
}

export async function academicRefreshRateLimitMiddleware(c: Context, next: Next) {
  if (c.req.query('refresh') !== 'true') {
    return next();
  }

  const userId = c.get('userId');
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
    return next();
  }

  const now = Date.now();
  cleanupStaleEntries(now);

  const existing = academicRefreshState.get(userId);
  if (!existing || now - existing.windowStart >= ACADEMIC_REFRESH_WINDOW_MS) {
    academicRefreshState.set(userId, {
      count: 1,
      touchedAt: now,
      windowStart: now,
    });
    return next();
  }

  existing.touchedAt = now;

  if (existing.count >= ACADEMIC_REFRESH_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.windowStart + ACADEMIC_REFRESH_WINDOW_MS - now) / 1000)
    );
    c.header('Retry-After', String(retryAfterSeconds));
    return error(c, ErrorCode.TOO_MANY_REQUESTS, `教务刷新请求过于频繁，请 ${retryAfterSeconds} 秒后再试`, 429);
  }

  existing.count += 1;
  academicRefreshState.set(userId, existing);
  return next();
}

export function resetAcademicRefreshRateLimitStateForTests() {
  academicRefreshState.clear();
  lastCleanupAt = 0;
}
