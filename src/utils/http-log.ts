/**
 * [INPUT]: 依赖 Hono Context，并使用 `_httpLog` 约定键保存请求日志细节
 * [OUTPUT]: 对外提供 formatHttpLogDetail()、appendHttpLogDetail() 与 getHttpLogDetail()
 * [POS]: utils 的 HTTP 日志上下文工具，被 routes 写入、logging.middleware 读取
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { Context } from 'hono';

interface HttpLogState {
  detail?: string[];
}

const HTTP_LOG_STATE_KEY = '_httpLog';

function normalizeDetail(detail?: string | string[]) {
  if (!detail) return [];

  const values = Array.isArray(detail) ? detail : [detail];
  return values
    .map((value) => value.trim())
    .filter(Boolean);
}

function formatDetailValue(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;

  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.join(',');
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatHttpLogDetail(fields: Record<string, unknown>) {
  return Object.entries(fields)
    .flatMap(([key, value]) => {
      const formatted = formatDetailValue(value);
      return formatted ? [`${key}=${formatted}`] : [];
    })
    .join('; ');
}

export function appendHttpLogDetail(c: Context, detail?: string | string[]) {
  const lines = normalizeDetail(detail);
  if (lines.length === 0) return;

  const current = (c.get(HTTP_LOG_STATE_KEY as any) as HttpLogState | undefined) ?? {};
  c.set(HTTP_LOG_STATE_KEY as any, {
    ...current,
    detail: [...(current.detail ?? []), ...lines],
  });
}

export function getHttpLogDetail(c: Context) {
  const current = c.get(HTTP_LOG_STATE_KEY as any) as HttpLogState | undefined;
  return current?.detail;
}
