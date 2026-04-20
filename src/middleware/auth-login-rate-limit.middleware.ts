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

function normalizeUsername(username: string) {
  return username.trim();
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
  username: string,
  now = Date.now()
): AuthLoginRateLimitStatus {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    return { failureCount: 0, limited: false, retryAfterSeconds: 0 };
  }

  cleanupStaleEntries(now);

  const existing = authLoginRateLimitState.get(normalizedUsername);
  if (!existing) {
    return { failureCount: 0, limited: false, retryAfterSeconds: 0 };
  }

  if (
    existing.blockedUntil <= now
    && now - existing.windowStart >= config.authLoginRateLimit.windowMs
  ) {
    authLoginRateLimitState.delete(normalizedUsername);
    return { failureCount: 0, limited: false, retryAfterSeconds: 0 };
  }

  return buildStatus(existing, now);
}

export function recordAuthLoginFailure(
  username: string,
  now = Date.now()
): AuthLoginRateLimitStatus {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    return { failureCount: 0, limited: false, retryAfterSeconds: 0 };
  }

  cleanupStaleEntries(now);

  const existing = authLoginRateLimitState.get(normalizedUsername);
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

  authLoginRateLimitState.set(normalizedUsername, entry);
  return buildStatus(entry, now);
}

export function resetAuthLoginRateLimit(username: string) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return;
  authLoginRateLimitState.delete(normalizedUsername);
}

export function resetAuthLoginRateLimitStateForTests() {
  authLoginRateLimitState.clear();
  lastCleanupAt = 0;
}
