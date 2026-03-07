import type { Context, Env } from 'hono';
import { AppError, ErrorCode } from '../utils/errors';
import { error } from '../utils/response';
import { Logger } from '../utils/logger';

/**
 * Hono onError handler — catches ALL errors including those in sub-apps.
 * Must be registered via app.onError(), NOT as middleware.
 */
export function onAppError(err: Error, c: Context<Env>) {
  if (err instanceof AppError) {
    Logger.error('App', err.message);
    return error(c, err.code, err.message, err.httpStatus);
  }

  if (err.message === 'REQUEST_TIMEOUT') {
    return error(c, ErrorCode.UPSTREAM_TIMEOUT, '上游服务超时', 504);
  }

  if (err.message === 'SESSION_EXPIRED') {
    return error(c, ErrorCode.CREDENTIAL_EXPIRED, '凭证已过期，请重新登录', 401);
  }

  if (err.message === 'SCHEDULE_NOT_AVAILABLE') {
    return c.json({
      success: true,
      data: { week: '暂无', courses: [], message: '课表暂未公布' },
    });
  }

  Logger.error('Unhandled', err.message, err);
  return error(c, ErrorCode.INTERNAL_ERROR, '服务器内部错误', 500);
}
