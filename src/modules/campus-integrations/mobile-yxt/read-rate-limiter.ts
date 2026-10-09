/**
 * [INPUT]: 依赖用户 ID、交易/电费读取范围、请求时间与统一 TOO_MANY_REQUESTS 错误语义
 * [OUTPUT]: 对外提供独立交易/电费 MobileYxtReadQuota 与兼容交易配额入口，限制实际 miss/refresh 回源
 * [POS]: mobile-yxt 自有内存限流状态；交易与电费互不消耗，也不读取 Academic refresh/realtime 桶
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md；不暴露测试专用状态重置入口
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

type ReadScope = 'trades' | 'electricity';

const state = new Map<string, RateLimitEntry>();
let lastCleanupAt = 0;

function cleanup(now: number): void {
  if (now - lastCleanupAt < STALE_ENTRY_TTL_MS) return;
  for (const [key, entry] of state) {
    if (now - entry.touchedAt >= STALE_ENTRY_TTL_MS) state.delete(key);
  }
  lastCleanupAt = now;
}

function consumeReadQuota(scope: ReadScope, userId: number, now: number): void {
  if (!Number.isSafeInteger(userId) || userId <= 0) return;
  cleanup(now);
  const key = `${scope}:${userId}`;
  const existing = state.get(key);
  if (!existing || now - existing.windowStart >= MOBILE_YXT_READ_WINDOW_MS) {
    state.set(key, { count: 1, touchedAt: now, windowStart: now });
    return;
  }
  existing.touchedAt = now;
  if (existing.count >= MOBILE_YXT_READ_MAX_REQUESTS) {
    throw new AppError(ErrorCode.TOO_MANY_REQUESTS, 'mobile-yxt 只读请求过于频繁，请稍后再试');
  }
  existing.count += 1;
}

export function consumeMobileYxtReadQuota(userId: number, now = Date.now()): void {
  consumeReadQuota('trades', userId, now);
}

export const mobileYxtTradeReadQuota: MobileYxtReadQuota = {
  consume: consumeMobileYxtReadQuota,
};

export const mobileYxtElectricityReadQuota: MobileYxtReadQuota = {
  consume: (userId) => consumeReadQuota('electricity', userId, Date.now()),
};

export const mobileYxtReadQuota = mobileYxtTradeReadQuota;
