import { AppError, ErrorCode } from './errors';
import { Logger } from './logger';

function getErrorPriority(error: unknown): number {
  if (error instanceof AppError) {
    switch (error.code) {
      case ErrorCode.PARAM_ERROR:
        return 100;
      case ErrorCode.JWT_INVALID:
      case ErrorCode.CREDENTIAL_EXPIRED:
        return 90;
      case ErrorCode.UPSTREAM_TIMEOUT:
        return 80;
      case ErrorCode.CAS_LOGIN_FAILED:
        return 70;
      case ErrorCode.TOO_MANY_REQUESTS:
        return 60;
      case ErrorCode.INTERNAL_ERROR:
      default:
        return 10;
    }
  }

  const message = String((error as any)?.message || '');
  if (message === 'SESSION_EXPIRED') return 90;
  if (message === 'REQUEST_TIMEOUT') return 80;
  if (message === 'SCHEDULE_NOT_AVAILABLE') return 70;
  if (message) return 10;
  return 0;
}

function formatError(error: unknown): string {
  if (error instanceof AppError) {
    return `code=${error.code} message=${error.message}`;
  }

  if (error instanceof Error) {
    return error.message || error.name;
  }

  return String(error);
}

export function resolveFallbackError(options: {
  primarySource: string;
  fallbackSource: string;
  primaryError: unknown;
  fallbackError: unknown;
  studentId?: string;
}): unknown {
  const primaryPriority = getErrorPriority(options.primaryError);
  const fallbackPriority = getErrorPriority(options.fallbackError);
  const selectedSource = fallbackPriority > primaryPriority ? options.fallbackSource : options.primarySource;

  Logger.warn(
    'RouteFallback',
    `${options.primarySource} 失败，${options.fallbackSource} 兜底也失败`,
    [
      `primary=${options.primarySource}:${formatError(options.primaryError)}`,
      `fallback=${options.fallbackSource}:${formatError(options.fallbackError)}`,
      `selected=${selectedSource}`,
    ].join('; '),
    options.studentId,
  );

  return selectedSource === options.fallbackSource ? options.fallbackError : options.primaryError;
}
