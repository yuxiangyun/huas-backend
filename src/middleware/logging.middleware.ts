import type { Context, Next } from 'hono';
import { getHttpLogDetail } from '../utils/http-log';
import { Logger } from '../utils/logger';

export async function loggingMiddleware(c: Context, next: Next) {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  const method = c.req.method;
  const path = new URL(c.req.url).pathname;

  const studentId = c.get('studentId' as any) as string | undefined;
  const name = c.get('name' as any) as string | undefined;
  const meta = c.get('_resMeta' as any) as { cached?: boolean; source?: string } | undefined;
  const detail = getHttpLogDetail(c);
  Logger.http(method, path, c.res.status, duration, studentId, name, meta, detail);
}
