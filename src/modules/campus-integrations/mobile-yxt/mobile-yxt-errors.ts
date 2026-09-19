/**
 * [INPUT]: 依赖统一 AppError/ErrorCode、mobile-yxt 认证、业务和协议失败事实
 * [OUTPUT]: 对外提供无敏感正文的类型化错误构造、凭证拒绝判定、低敏感 operation/stage、HTTP 状态校验与 stale/fatal 判定
 * [POS]: mobile-yxt 的错误语义边界，学校会话拒绝外部按 503，只有 CAS 交互要求才退出；保留超时、可用性与协议漂移分类
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';

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
    ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE,
    '学校会话恢复后仍不可用，请稍后重试',
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
    ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE,
    'mobile-yxt 上游响应协议无法识别',
    false,
    operation,
    stage,
  );
}

export function assertMobileYxtHttpSuccess(status: number, operation?: string): void {
  if (status >= 200 && status < 300) return;
  if (status === 401) throw mobileYxtCredentialRejected();
  if (status >= 500) throw mobileYxtUnavailable();
  throw mobileYxtBusinessFailure(operation);
}

export function allowsMobileYxtStaleFallback(error: unknown): boolean {
  // 总预算可能在两页交易或 config→account 之间耗尽，统一入口的超时同样允许旧值兜底。
  return (error instanceof AppError && error.code === ErrorCode.UPSTREAM_TIMEOUT)
    || (error instanceof MobileYxtError && error.staleAllowed);
}

export function isFatalMobileYxtSubsourceError(error: unknown): boolean {
  if (error instanceof MobileYxtError) return !error.staleAllowed;
  return error instanceof AppError && (
    error.code === ErrorCode.CREDENTIAL_EXPIRED
    || error.code === ErrorCode.PARAM_ERROR
    || error.code === ErrorCode.TOO_MANY_REQUESTS
  );
}
