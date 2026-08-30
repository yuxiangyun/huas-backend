/**
 * [INPUT]: 依赖 canonical CacheService、CacheMeta、AppError/ErrorCode 与 Logger
 * [OUTPUT]: 对外提供 fallbackOnRefreshFailure() 与可注入观察器，仅为非凭证型回源失败选择已校验的 stale 缓存
 * [POS]: services/infra 的缓存降级策略边界，在记录回退成功前淘汰调用方拒绝的旧值，禁止用旧数据掩盖需要用户重新认证的 3003
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { CacheService } from '../../modules/cache/cache-service';
import type { CacheMeta } from '../../types';
import { AppError, ErrorCode } from '../../utils/errors';
import { Logger } from '../../utils/logger';

export interface RefreshFallbackObservers {
  recordFallback?: () => void;
}

export type RefreshFallbackResult<T> = {
  data: T;
  _meta: CacheMeta;
};

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
  discardCached?: (data: T) => boolean;
}): Promise<RefreshFallbackResult<T> | null> {
  const errorCode = toErrorCode(options.error);
  if (
    errorCode === ErrorCode.PARAM_ERROR
    || errorCode === ErrorCode.EVALUATION_REQUIRED
    || errorCode === ErrorCode.CREDENTIAL_EXPIRED
  ) return null;

  let cached = await CacheService.get<T>(options.cacheKey, { touch: true, allowExpired: true });
  if (!cached) return null;

  if (options.discardCached?.(cached.data)) {
    const invalidated = await CacheService.invalidateIfVersion(options.cacheKey, cached.versionToken);
    if (invalidated) return null;

    // 条件删除失败说明同 key 已被并发写入；只允许其替代值进入 stale fallback。
    cached = await CacheService.get<T>(options.cacheKey, { touch: true, allowExpired: true });
    if (!cached || options.discardCached(cached.data)) return null;
  }

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
