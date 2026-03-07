import type { Context } from 'hono';
import type { CacheMeta } from '../types';

export function success<T>(c: Context, data: T, meta?: Partial<CacheMeta>, status = 200) {
  const body: any = { success: true, data };
  if (meta) {
    body._meta = {
      cached: meta.cached ?? false,
      ...meta,
    };
    // Pass cache info to logging middleware via Context
    c.set('_resMeta' as any, body._meta);
  }
  return c.json(body, status as any);
}

export function error(c: Context, errorCode: number, message: string, httpStatus = 500) {
  return c.json({
    success: false,
    error_code: errorCode,
    error_message: message,
  }, httpStatus as any);
}
