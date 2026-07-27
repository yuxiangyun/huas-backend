/**
 * [INPUT]: 依赖 canonical CacheService、CacheMeta、AppError/ErrorCode 与 Logger
 * [OUTPUT]: 对外提供 fallbackOnRefreshFailure() 与可注入观察器，仅为非凭证型回源失败选择 stale 缓存
 * [POS]: services/infra 的缓存降级策略边界，禁止用旧数据掩盖需要用户重新认证的 3003
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { CacheService } from '../../modules/cache/cache-service';
import type { CacheMeta } from '../../types';
import { AppError, ErrorCode } from '../../utils/errors';
import { Logger } from '../../utils/logger';

export interface RefreshFallbackObservers {
  recordFallback?: () => void;
}

let observers: RefreshFallbackObservers = {};

export function configureRefreshFallbackObservers(next: RefreshFallbackObservers): () => void {
  const previous = observers;
  observers = next;
  return () => {
    if (observers === next) observers = previous;
  };
}

function toErrorCode(error: unknown): number {
  if (error instanceof AppError) return error.code;
  const message = String((error as any)?.message || '');
  if (message === 'REQUEST_TIMEOUT') return ErrorCode.UPSTREAM_TIMEOUT;
  if (message === 'SESSION_EXPIRED') return ErrorCode.CREDENTIAL_EXPIRED;
  return ErrorCode.INTERNAL_ERROR;
}

export async function fallbackOnRefreshFailure<T>(options: {
  forceRefresh: boolean;
  cacheKey: string;
  error: unknown;
  source: string;
  studentId: string;
}): Promise<{ data: T; _meta: CacheMeta } | null> {
  const errorCode = toErrorCode(options.error);
  if (
    errorCode === ErrorCode.PARAM_ERROR
    || errorCode === ErrorCode.EVALUATION_REQUIRED
    || errorCode === ErrorCode.CREDENTIAL_EXPIRED
  ) return null;

  const cached = await CacheService.get<T>(options.cacheKey, { touch: true, allowExpired: true });
  if (!cached) return null;

  Logger.warn(
    'RefreshFallback',
    `${options.source} ${options.forceRefresh ? '强制刷新' : '回源请求'}失败，回退缓存`,
    `error_code=${errorCode}`,
    options.studentId
  );
  try {
    observers.recordFallback?.();
  } catch {
    // 指标观察失败不能破坏已经选定的业务 fallback。
  }

  return {
    data: cached.data,
    _meta: {
      ...cached.meta,
      stale: true,
      refresh_failed: true,
      last_error: errorCode,
    },
  };
}
