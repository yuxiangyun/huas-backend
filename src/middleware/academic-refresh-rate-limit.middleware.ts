/**
 * [INPUT]: 依赖 Hono Context/Next、ErrorCode 与 response.error，读取认证后的 userId 和请求回源意图
 * [OUTPUT]: 对外提供按 refresh 或固定实时回源计数的限流中间件与测试态重置函数
 * [POS]: middleware 的校园上游限流边界，以用户与回源类别为粒度保护学校系统，不承载业务事实
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

const academicRefreshState = new Map<string, RateLimitEntry>();
let lastCleanupAt = 0;

function cleanupStaleEntries(now: number) {
  if (now - lastCleanupAt < STALE_ENTRY_TTL_MS) return;

  for (const [key, entry] of academicRefreshState) {
    if (now - entry.touchedAt >= STALE_ENTRY_TTL_MS) {
      academicRefreshState.delete(key);
    }
  }

  lastCleanupAt = now;
}

async function enforceAcademicRateLimit(c: Context, next: Next, scope: 'refresh' | 'realtime') {
  const userId = c.get('userId');
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
    return next();
  }

  const now = Date.now();
  cleanupStaleEntries(now);

  const key = `${scope}:${userId}`;
  const existing = academicRefreshState.get(key);
  if (!existing || now - existing.windowStart >= ACADEMIC_REFRESH_WINDOW_MS) {
    academicRefreshState.set(key, {
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
    const label = scope === 'refresh' ? '教务刷新' : '校园实时';
    return error(c, ErrorCode.TOO_MANY_REQUESTS, `${label}请求过于频繁，请 ${retryAfterSeconds} 秒后再试`, 429);
  }

  existing.count += 1;
  academicRefreshState.set(key, existing);
  return next();
}

export async function academicRefreshRateLimitMiddleware(c: Context, next: Next) {
  if (c.req.query('refresh') !== 'true') return next();
  return enforceAcademicRateLimit(c, next, 'refresh');
}

export async function academicRealtimeRateLimitMiddleware(c: Context, next: Next) {
  return enforceAcademicRateLimit(c, next, 'realtime');
}

export function resetAcademicRefreshRateLimitStateForTests() {
  academicRefreshState.clear();
  lastCleanupAt = 0;
}
