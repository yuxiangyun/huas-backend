/**
 * [INPUT]: 依赖 Hono Context 与 CacheMeta 类型
 * [OUTPUT]: 对外提供 success() 与 error() 统一 JSON 响应函数
 * [POS]: utils 的响应体契约源，同时通过 `_resMeta` 约定键向 logging.middleware 传递缓存元信息
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

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

export function error(c: Context, errorCode: number, message: string, httpStatus = 500, data?: unknown) {
  const body: any = {
    success: false,
    error_code: errorCode,
    error_message: message,
  };
  if (data !== undefined) body.data = data;
  return c.json(body, httpStatus as any);
}
