/**
 * [INPUT]: 依赖 Hono Context 与 config 的登录限流配置
 * [OUTPUT]: 对外提供登录限流 key 构造、状态查询、失败记录、成功重置和测试清理函数
 * [POS]: middleware 的登录失败内存限流器，被 auth.routes.ts 在 CAS 登录入口显式调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import type { Context } from 'hono';
import { config } from '../config';

type AuthLoginRateLimitEntry = {
  blockedUntil: number;
  failureCount: number;
  touchedAt: number;
  windowStart: number;
};

export type AuthLoginRateLimitStatus = {
  failureCount: number;
  limited: boolean;
  retryAfterSeconds: number;
};

const authLoginRateLimitState = new Map<string, AuthLoginRateLimitEntry>();
const AUTH_LOGIN_RATE_LIMIT_TTL_MS = Math.max(
  config.authLoginRateLimit.windowMs,
  config.authLoginRateLimit.blockMs
) * 3;

let lastCleanupAt = 0;

function normalizePart(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

export function buildAuthLoginRateLimitKey(username: string, clientIp?: string | null) {
  const normalizedUsername = normalizePart(username);
  if (!normalizedUsername) return '';
  return `${normalizedUsername}:${normalizePart(clientIp) || 'unknown'}`;
}

function buildStatus(entry?: AuthLoginRateLimitEntry, now = Date.now()): AuthLoginRateLimitStatus {
  if (!entry || entry.blockedUntil <= now) {
    return {
      failureCount: entry?.failureCount ?? 0,
      limited: false,
      retryAfterSeconds: 0,
    };
  }

  return {
    failureCount: entry.failureCount,
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000)),
  };
}

function cleanupStaleEntries(now: number) {
  if (now - lastCleanupAt < AUTH_LOGIN_RATE_LIMIT_TTL_MS) return;

  for (const [username, entry] of authLoginRateLimitState) {
    if (entry.blockedUntil > now) continue;
    if (now - entry.touchedAt >= AUTH_LOGIN_RATE_LIMIT_TTL_MS) {
      authLoginRateLimitState.delete(username);
    }
  }

  lastCleanupAt = now;
}

export function getAuthLoginClientIp(c: Context): string | null {
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor
      .split(',')
      .map((part) => part.trim())
      .find(Boolean);
    if (first) return first;
  }

  const realIp = c.req.header('x-real-ip')?.trim();
  if (realIp) return realIp;

  const cfConnectingIp = c.req.header('cf-connecting-ip')?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  return null;
}

export function getAuthLoginRateLimitStatus(
  key: string,
  now = Date.now()
): AuthLoginRateLimitStatus {
  const normalizedKey = normalizePart(key);
  if (!normalizedKey) {
    return { failureCount: 0, limited: false, retryAfterSeconds: 0 };
  }

  cleanupStaleEntries(now);

  const existing = authLoginRateLimitState.get(normalizedKey);
  if (!existing) {
    return { failureCount: 0, limited: false, retryAfterSeconds: 0 };
  }

  if (
    existing.blockedUntil <= now
    && now - existing.windowStart >= config.authLoginRateLimit.windowMs
  ) {
    authLoginRateLimitState.delete(normalizedKey);
    return { failureCount: 0, limited: false, retryAfterSeconds: 0 };
  }

  return buildStatus(existing, now);
}

export function recordAuthLoginFailure(
  key: string,
  now = Date.now()
): AuthLoginRateLimitStatus {
  const normalizedKey = normalizePart(key);
  if (!normalizedKey) {
    return { failureCount: 0, limited: false, retryAfterSeconds: 0 };
  }

  cleanupStaleEntries(now);

  const existing = authLoginRateLimitState.get(normalizedKey);
  const shouldResetWindow = !existing || (
    existing.blockedUntil <= now
    && now - existing.windowStart >= config.authLoginRateLimit.windowMs
  );

  const entry: AuthLoginRateLimitEntry = shouldResetWindow
    ? {
      blockedUntil: 0,
      failureCount: 0,
      touchedAt: now,
      windowStart: now,
    }
    : existing;

  entry.failureCount += 1;
  entry.touchedAt = now;

  if (entry.failureCount >= config.authLoginRateLimit.maxFailures) {
    entry.blockedUntil = Math.max(entry.blockedUntil, now + config.authLoginRateLimit.blockMs);
  }

  authLoginRateLimitState.set(normalizedKey, entry);
  return buildStatus(entry, now);
}

export function resetAuthLoginRateLimit(key: string) {
  const normalizedKey = normalizePart(key);
  if (!normalizedKey) return;
  authLoginRateLimitState.delete(normalizedKey);
}

export function resetAuthLoginRateLimitStateForTests() {
  authLoginRateLimitState.clear();
  lastCleanupAt = 0;
}
