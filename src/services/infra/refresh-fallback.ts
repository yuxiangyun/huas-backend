import { CacheService } from './cache-service';
import type { CacheMeta } from '../../types';
import { AppError, ErrorCode } from '../../utils/errors';
import { Logger } from '../../utils/logger';

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
  if (errorCode === ErrorCode.PARAM_ERROR) return null;

  const cached = await CacheService.get<T>(options.cacheKey, { touch: true, allowExpired: true });
  if (!cached) return null;

  Logger.warn(
    'RefreshFallback',
    `${options.source} ${options.forceRefresh ? '强制刷新' : '回源请求'}失败，回退缓存`,
    `error_code=${errorCode}`,
    options.studentId
  );

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
