/**
 * [INPUT]: 依赖 Hono 请求上下文、HTTP 日志详情与统一 Logger，并识别 Social 聚合及领域增量的高频只读轮询路径
 * [OUTPUT]: 对外提供 loggingMiddleware；静默成功轮询访问日志，同时保留失败响应、写操作与全部其他 HTTP 日志
 * [POS]: middleware 的 HTTP 可观测性边界；只决定访问日志采样，不参与 app.ts 中独立执行的 HTTP metrics 统计
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { Context, Next } from 'hono';
import { getHttpLogDetail } from '../utils/http-log';
import { Logger } from '../utils/logger';

const STATIC_ASSET_EXT_RE = /\.(?:js|mjs|css|map|png|jpe?g|gif|webp|svg|ico|avif|woff2?|ttf|otf|eot)$/i;
const QUIET_POLL_PATHS = [
  /^\/api\/notifications(?:\/unread-count|\/changes)?$/,
  /^\/api\/messaging\/unread-count$/,
  /^\/api\/messaging\/conversations(?:\/changes)?$/,
  /^\/api\/messaging\/conversations\/\d+\/messages$/,
  /^\/api\/social\/unread-summary$/,
] as const;

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

function isSuccessfulQuietPoll(method: string, path: string, status: number) {
  return method === 'GET'
    && status >= 200
    && status < 400
    && QUIET_POLL_PATHS.some((pattern) => pattern.test(path));
}

export async function loggingMiddleware(c: Context, next: Next) {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  const method = c.req.method;
  const path = new URL(c.req.url).pathname;
  if (shouldSkipHttpLog(path)) return;
  if (isSuccessfulQuietPoll(method, path, c.res.status)) return;

  const studentId = c.get('studentId' as any) as string | undefined;
  const name = c.get('name' as any) as string | undefined;
  const meta = c.get('_resMeta' as any) as { cached?: boolean; source?: string } | undefined;
  const detail = getHttpLogDetail(c);
  Logger.http(method, path, c.res.status, duration, studentId, name, meta, detail);
}
