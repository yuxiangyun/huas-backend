import type { Context, Next } from 'hono';
import { getHttpLogDetail } from '../utils/http-log';
import { Logger } from '../utils/logger';

const STATIC_ASSET_EXT_RE = /\.(?:js|mjs|css|map|png|jpe?g|gif|webp|svg|ico|avif|woff2?|ttf|otf|eot)$/i;

function shouldSkipHttpLog(path: string) {
  // Keep all API logs; only suppress frontend/static resource requests.
  if (path === '/api' || path.startsWith('/api/')) return false;

  if (path.startsWith('/m/')) {
    const pathAfterBase = path.slice(3);
    if (pathAfterBase.includes('.')) return true;
  }

  const lastSegment = path.split('/').at(-1) ?? '';
  return STATIC_ASSET_EXT_RE.test(lastSegment);
}

export async function loggingMiddleware(c: Context, next: Next) {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  const method = c.req.method;
  const path = new URL(c.req.url).pathname;
  if (shouldSkipHttpLog(path)) return;

  const studentId = c.get('studentId' as any) as string | undefined;
  const name = c.get('name' as any) as string | undefined;
  const meta = c.get('_resMeta' as any) as { cached?: boolean; source?: string } | undefined;
  const detail = getHttpLogDetail(c);
  Logger.http(method, path, c.res.status, duration, studentId, name, meta, detail);
}
