import type { Context, Next } from 'hono';
import { timingSafeEqual } from 'node:crypto';

// Fixed credentials by requirement
const ADMIN_USERNAME = '202412040130';
const ADMIN_PASSWORD = 'A18569081662';

const BASIC_PREFIX = 'Basic ';
const AUTH_CHALLENGE = 'Basic realm="HUAS Admin", charset="UTF-8"';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
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

  if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
    return unauthorized(c);
  }

  await next();
}
