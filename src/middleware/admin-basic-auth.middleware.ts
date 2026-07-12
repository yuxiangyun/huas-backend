/**
 * [INPUT]: 依赖 Hono Context/Next、process.env 管理凭据与 node:crypto 时序安全比较
 * [OUTPUT]: 对外提供 adminBasicAuthMiddleware，并扩展 adminUser 上下文
 * [POS]: middleware 的管理端 Basic Auth 边界，配置缺失时默认拒绝访问
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { Context, Next } from 'hono';
import { createHash, timingSafeEqual } from 'node:crypto';

declare module 'hono' {
  interface ContextVariableMap {
    adminUser?: string;
  }
}

const BASIC_PREFIX = 'Basic ';
const AUTH_CHALLENGE = 'Basic realm="HUAS Admin", charset="UTF-8"';

function safeEqual(a: string, b: string): boolean {
  const aDigest = createHash('sha256').update(a, 'utf8').digest();
  const bDigest = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(aDigest, bDigest);
}

function getAdminCredentials() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

function unauthorized(c: Context) {
  c.header('WWW-Authenticate', AUTH_CHALLENGE);
  return c.text('Unauthorized', 401);
}

export async function adminBasicAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization') ?? c.req.header('authorization');

  if (!authHeader?.startsWith(BASIC_PREFIX)) {
    return unauthorized(c);
  }

  let decoded = '';
  try {
    decoded = Buffer.from(authHeader.slice(BASIC_PREFIX.length), 'base64').toString('utf8');
  } catch {
    return unauthorized(c);
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex <= 0) {
    return unauthorized(c);
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  const credentials = getAdminCredentials();

  if (!credentials) {
    return unauthorized(c);
  }

  const usernameMatches = safeEqual(username, credentials.username);
  const passwordMatches = safeEqual(password, credentials.password);
  if (!usernameMatches || !passwordMatches) {
    return unauthorized(c);
  }

  c.set('adminUser', username);
  await next();
}
