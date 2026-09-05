/**
 * [INPUT]: 依赖统一 AppError/ErrorCode、共享 HTTP 传输错误判定与 mobile-yxt 认证、业务和协议失败事实
 * [OUTPUT]: 对外提供无敏感正文的类型化错误构造、凭证拒绝判定、低敏感 operation/stage、HTTP 状态校验、跨运行时传输错误归一化与 stale/fatal 判定
 * [POS]: mobile-yxt 的错误语义边界，确保 401、超时、可用性故障与可定位协议漂移不会互相冒充
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { errorFacts, isTransientTransportError as isMobileYxtTransientTransportError } from '../http/transport-errors';
export { isTransientTransportError as isMobileYxtTransientTransportError } from '../http/transport-errors';

export type MobileYxtFailureKind = 'credential' | 'timeout' | 'unavailable' | 'business' | 'protocol';

export type MobileYxtFailureStage =
  | 'envelope_invalid'
  | 'business_rejected'
  | 'config_location_invalid'
  | 'account_invalid'
  | 'template_list_invalid'
  | 'required_field_missing'
  | 'numeric_format_invalid'
  | 'contract_drift';

export class MobileYxtError extends AppError {
  constructor(
    public readonly kind: MobileYxtFailureKind,
    code: ErrorCode,
    message: string,
    public readonly staleAllowed: boolean,
    public readonly operation?: string,
    public readonly stage?: MobileYxtFailureStage,
  ) {
    super(code, message);
  }
}

export function mobileYxtCredentialRejected(): MobileYxtError {
  return new MobileYxtError(
    'credential',
    ErrorCode.CREDENTIAL_EXPIRED,
    '学校登录状态已失效，请重新登录',
    false,
  );
}

export function isMobileYxtCredentialRejected(error: unknown): error is MobileYxtError {
  return error instanceof MobileYxtError && error.kind === 'credential';
}

export function mobileYxtTimeout(): MobileYxtError {
  return new MobileYxtError(
    'timeout',
    ErrorCode.UPSTREAM_TIMEOUT,
    'mobile-yxt 上游请求超时',
    true,
  );
}

export function mobileYxtUnavailable(): MobileYxtError {
  return new MobileYxtError(
    'unavailable',
    ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE,
    'mobile-yxt 上游服务暂不可用',
    true,
  );
}

export function mobileYxtBusinessFailure(operation?: string): MobileYxtError {
  return new MobileYxtError(
    'business',
    ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE,
    'mobile-yxt 上游拒绝了只读请求',
    false,
    operation,
    'business_rejected',
  );
}

export function mobileYxtProtocolFailure(
  operation?: string,
  stage: MobileYxtFailureStage = 'envelope_invalid',
): MobileYxtError {
  return new MobileYxtError(
    'protocol',
    ErrorCode.INTERNAL_ERROR,
    'mobile-yxt 上游响应协议无法识别',
    false,
    operation,
    stage,
  );
}


export function normalizeMobileYxtTransportError(error: unknown): MobileYxtError {
  if (error instanceof MobileYxtError) return error;
  const facts = errorFacts(error);
  if (/\bREQUEST_TIMEOUT\b/.test(facts)) return mobileYxtTimeout();
  if (isMobileYxtTransientTransportError(error)) return mobileYxtUnavailable();
  return mobileYxtProtocolFailure();
}


export function assertMobileYxtHttpSuccess(status: number, operation?: string): void {
  if (status >= 200 && status < 300) return;
  if (status === 401) throw mobileYxtCredentialRejected();
  if (status >= 500) throw mobileYxtUnavailable();
  throw mobileYxtBusinessFailure(operation);
}

export function allowsMobileYxtStaleFallback(error: unknown): boolean {
  return error instanceof MobileYxtError && error.staleAllowed;
}

export function isFatalMobileYxtSubsourceError(error: unknown): boolean {
  if (error instanceof MobileYxtError) return !error.staleAllowed;
  return error instanceof AppError && (
    error.code === ErrorCode.CREDENTIAL_EXPIRED
    || error.code === ErrorCode.PARAM_ERROR
    || error.code === ErrorCode.TOO_MANY_REQUESTS
  );
}
