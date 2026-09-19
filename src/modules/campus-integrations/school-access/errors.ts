/**
 * [INPUT]: 依赖统一 AppError 与共享传输错误事实，不读取学校正文或凭证，保留未公布这一业务来源信号
 * [OUTPUT]: 对外提供内部 SchoolAccessError、失败归一化与明确重试资格，交互要求才映射 3003
 * [POS]: SchoolAccess 单一失败语义，协议只报告事实，执行器决定是否重试
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { AppError, ErrorCode } from '../../../utils/errors';
import { MobileJwError } from '../mobile-jw/errors';
import { MobileYxtError } from '../mobile-yxt/mobile-yxt-errors';
import { errorFacts, isTransientTransportError } from '../http/transport-errors';

export type SchoolFailureKind = 'interaction-required' | 'credentials-rejected' | 'session-rejected' | 'unavailable' | 'timeout' | 'protocol';
export class SchoolAccessError extends AppError {
  constructor(readonly kind: SchoolFailureKind, message: string, readonly retryable = false) {
    super(kind === 'interaction-required' ? ErrorCode.CREDENTIAL_EXPIRED
      : kind === 'credentials-rejected' ? ErrorCode.CAS_LOGIN_FAILED
      : kind === 'timeout' ? ErrorCode.UPSTREAM_TIMEOUT : ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, message);
  }
}
export const schoolUnavailable = () => new SchoolAccessError('unavailable', '学校业务能力暂不可用，请稍后重试');
export const schoolTimeout = () => new SchoolAccessError('timeout', '学校请求超时，请稍后重试', true);
export const interactionRequired = () => new SchoolAccessError('interaction-required', '学校要求重新认证，请重新登录');
export const sessionRejected = () => new SchoolAccessError('session-rejected', '学校会话已失效');

export function normalizeSchoolFailure(error: unknown): Error {
  if (error instanceof MobileJwError || error instanceof MobileYxtError) {
    if (error.kind === 'timeout') return schoolTimeout();
    if (error.kind === 'unavailable') return new SchoolAccessError('unavailable', error.message, true);
  }
  if (error instanceof AppError) return error;
  if (error instanceof Error && error.message === 'SCHEDULE_NOT_AVAILABLE') return error;
  const facts = errorFacts(error);
  if (/\bREQUEST_TIMEOUT\b/.test(facts)) return schoolTimeout();
  if (error instanceof Error && error.message === 'SESSION_EXPIRED') return sessionRejected();
  if (isTransientTransportError(error) || /_HTTP_5\d\d\b|CAS_MAINTENANCE|GRADE_PAGE_INVALID/.test(facts)) {
    return new SchoolAccessError('unavailable', '学校服务暂不可用，请稍后重试', true);
  }
  return new SchoolAccessError('protocol', '学校响应暂时无法识别，请稍后重试');
}

export function canRetrySchoolFailure(error: unknown): boolean {
  const failure = normalizeSchoolFailure(error);
  return failure instanceof SchoolAccessError && failure.retryable;
}
