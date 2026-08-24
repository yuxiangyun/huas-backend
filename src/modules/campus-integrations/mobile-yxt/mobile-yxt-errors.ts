/**
 * [INPUT]: 依赖统一 AppError/ErrorCode、Bun/Node 传输错误 cause 链与 mobile-yxt 认证、业务和协议失败事实
 * [OUTPUT]: 对外提供无敏感正文的类型化错误构造、凭证拒绝判定、低敏感 operation/stage、HTTP 状态校验、跨运行时传输错误归一化与 stale/fatal 判定
 * [POS]: mobile-yxt 的错误语义边界，确保 401、超时、可用性故障与可定位协议漂移不会互相冒充
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

function errorFacts(error: unknown): string {
  const facts: string[] = [];
  const visited = new Set<object>();
  let current: unknown = error;

  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    if (visited.has(current)) break;
    visited.add(current);
    const record = current as Record<string, unknown>;
    for (const key of ['name', 'message', 'code', 'errno', 'syscall']) {
      const value = record[key];
      if (typeof value === 'string' || typeof value === 'number') facts.push(String(value));
    }
    current = record.cause;
  }

  return facts.join(' ');
}

export function normalizeMobileYxtTransportError(error: unknown): MobileYxtError {
  if (error instanceof MobileYxtError) return error;
  const facts = errorFacts(error);
  if (/\bREQUEST_TIMEOUT\b/.test(facts)) return mobileYxtTimeout();
  if (isMobileYxtTransientTransportError(error)) return mobileYxtUnavailable();
  return mobileYxtProtocolFailure();
}

export function isMobileYxtTransientTransportError(error: unknown): boolean {
  const facts = errorFacts(error);
  return /\bREQUEST_TIMEOUT\b/.test(facts) || (
    /ECONN(?:RESET|REFUSED|ABORTED)|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|EPIPE|UND_ERR_/i.test(facts)
    || /Connection(?:Refused|Reset|TimedOut|Closed)|Socket(?:Closed|NotConnected)|fetch(?:\(\))? failed/i.test(facts)
    || /unable to connect|network|socket|connection (?:closed|refused|reset|timed? ?out)|\b(?:TLS|SSL|certificate|DNS)\b/i.test(facts)
  );
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
