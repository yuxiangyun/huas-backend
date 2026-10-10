import type { Context, Next } from 'hono';
import { ErrorCode } from '../../../utils/errors';
import { error } from '../../../utils/response';

const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;

/** 单实例固定窗口，状态有界；全局读取额度防止伪造来源地址无限扩容。 */
export function scheduleShareRateLimit(scope: 'create' | 'read') {
  const entries = new Map<string, { until: number; count: number }>();
  let global = { until: 0, count: 0 };
  return async (c: Context, next: Next) => {
    const now = Date.now();
    // 部署代理须覆盖 X-Real-IP；不能信任可由客户端置入首项的 X-Forwarded-For。
    const key = scope === 'create' ? String(c.get('userId')) : c.req.header('x-real-ip')?.trim() || 'unknown';
    const maximum = scope === 'create' ? 10 : 120;
    const globalMaximum = scope === 'create' ? 120 : 1200;
    if (global.until <= now) {
      global = { until: now + WINDOW_MS, count: 0 };
      for (const [entryKey, entry] of entries) if (entry.until <= now) entries.delete(entryKey);
    }
    const existing = entries.get(key);
    const entry = existing && existing.until > now ? existing : { until: now + WINDOW_MS, count: 0 };
    if (entry.count >= maximum || global.count >= globalMaximum || (!existing && entries.size >= MAX_KEYS)) {
      const retry = Math.max(1, Math.ceil((entry.count >= maximum ? entry.until : global.until) - now) / 1000);
      c.header('Retry-After', String(Math.ceil(retry)));
      return error(c, ErrorCode.TOO_MANY_REQUESTS, '课表分享请求过于频繁，请稍后重试', 429);
    }
    entry.count += 1;
    global.count += 1;
    entries.set(key, entry);
    await next();
  };
}
