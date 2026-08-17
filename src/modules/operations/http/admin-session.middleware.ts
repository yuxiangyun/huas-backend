/**
 * [INPUT]: 依赖 Hono Cookie、node:crypto 与 ADMIN_USERNAME/ADMIN_PASSWORD 环境配置
 * [OUTPUT]: 提供后台会话创建/撤销/认证能力与 adminUser 上下文
 * [POS]: operations/http 的后台独立认证边界，以 HttpOnly Cookie 管理仅主动撤销的服务端会话
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { Context, Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'huas_admin_session';
const MAX_SESSIONS = 128;

interface AdminSessionRecord {
  username: string;
  touchedAt: number;
}

const sessions = new Map<string, AdminSessionRecord>();

declare module 'hono' {
  interface ContextVariableMap {
    adminUser?: string;
  }
}

function safeEqual(left: string, right: string) {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function cookieOptions(c: Context) {
  const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  return {
    httpOnly: true,
    secure: forwardedProto === 'https' || new URL(c.req.url).protocol === 'https:',
    sameSite: 'Strict' as const,
    path: '/api/admin',
  };
}

function pruneSessions() {
  if (sessions.size < MAX_SESSIONS) return;
  const oldestToken = [...sessions.entries()]
    .sort((left, right) => left[1].touchedAt - right[1].touchedAt)[0]?.[0];
  if (oldestToken) sessions.delete(oldestToken);
}

function readSession(c: Context) {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) {
    sessions.delete(token);
    deleteCookie(c, COOKIE_NAME, { path: '/api/admin' });
    return null;
  }
  session.touchedAt = Date.now();
  return { token, session };
}

function sessionResponse(session: AdminSessionRecord) {
  return {
    username: session.username,
    expiresInSeconds: null,
  };
}

export function createAdminSession(c: Context, username: string, password: string) {
  const configuredUsername = process.env.ADMIN_USERNAME ?? '';
  const configuredPassword = process.env.ADMIN_PASSWORD ?? '';
  if (!configuredUsername || !configuredPassword) return null;
  if (!safeEqual(username, configuredUsername) || !safeEqual(password, configuredPassword)) return null;
  const token = randomBytes(32).toString('base64url');
  pruneSessions();
  const session = { username: configuredUsername, touchedAt: Date.now() };
  sessions.set(token, session);
  setCookie(c, COOKIE_NAME, token, cookieOptions(c));
  return sessionResponse(session);
}

export function revokeAdminSession(c: Context) {
  const token = getCookie(c, COOKIE_NAME);
  if (token) sessions.delete(token);
  deleteCookie(c, COOKIE_NAME, { path: '/api/admin' });
}

export function currentAdminSession(c: Context) {
  const resolved = readSession(c);
  return resolved ? sessionResponse(resolved.session) : null;
}

export async function adminSessionMiddleware(c: Context, next: Next) {
  const resolved = readSession(c);
  if (!resolved) return c.json({ success: false, error_code: 401, error_message: '后台会话已失效' }, 401);
  c.set('adminUser', resolved.session.username);
  await next();
}
