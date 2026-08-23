/**
 * [INPUT]: 依赖用户 ID、单调请求时间与统一 TOO_MANY_REQUESTS 错误语义
 * [OUTPUT]: 对外提供 MobileYxtReadQuota、consumeMobileYxtReadQuota 与测试态重置，独立限制 refresh 和缓存未命中回源
 * [POS]: mobile-yxt 自有内存限流状态；不读取也不消耗 Academic refresh/realtime 桶
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';

export const MOBILE_YXT_READ_WINDOW_MS = 5_000;
export const MOBILE_YXT_READ_MAX_REQUESTS = 5;
const STALE_ENTRY_TTL_MS = MOBILE_YXT_READ_WINDOW_MS * 3;

interface RateLimitEntry {
  count: number;
  touchedAt: number;
  windowStart: number;
}

export interface MobileYxtReadQuota {
  consume(userId: number): void;
}

const state = new Map<number, RateLimitEntry>();
let lastCleanupAt = 0;

function cleanup(now: number): void {
  if (now - lastCleanupAt < STALE_ENTRY_TTL_MS) return;
  for (const [userId, entry] of state) {
    if (now - entry.touchedAt >= STALE_ENTRY_TTL_MS) state.delete(userId);
  }
  lastCleanupAt = now;
}

export function consumeMobileYxtReadQuota(userId: number, now = Date.now()): void {
  if (!Number.isSafeInteger(userId) || userId <= 0) return;
  cleanup(now);
  const existing = state.get(userId);
  if (!existing || now - existing.windowStart >= MOBILE_YXT_READ_WINDOW_MS) {
    state.set(userId, { count: 1, touchedAt: now, windowStart: now });
    return;
  }
  existing.touchedAt = now;
  if (existing.count >= MOBILE_YXT_READ_MAX_REQUESTS) {
    throw new AppError(ErrorCode.TOO_MANY_REQUESTS, 'mobile-yxt 只读请求过于频繁，请稍后再试');
  }
  existing.count += 1;
}

export const mobileYxtReadQuota: MobileYxtReadQuota = {
  consume: consumeMobileYxtReadQuota,
};

export function resetMobileYxtReadRateLimitStateForTests(): void {
  state.clear();
  lastCleanupAt = 0;
}
