/**
 * [INPUT]: 依赖 AppError/ErrorCode 与共享 HTTP 传输错误判定
 * [OUTPUT]: 对外提供 MobileJwError、低敏感错误构造和已验证的会话失效判定
 * [POS]: mobile-jw 的协议错误边界，凭证拒绝与业务空态、协议漂移分开处理
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { errorFacts, isTransientTransportError } from '../http/transport-errors';

type FailureKind = 'credential' | 'timeout' | 'unavailable' | 'business' | 'protocol';

export class MobileJwError extends AppError {
  constructor(public readonly kind: FailureKind, code: ErrorCode, message: string) {
    super(code, message);
  }
}

export const credentialRejected = () => new MobileJwError(
  'credential', ErrorCode.CREDENTIAL_EXPIRED, '学校登录状态已失效，请重新登录',
);
export const protocolFailure = () => new MobileJwError(
  'protocol', ErrorCode.INTERNAL_ERROR, '移动教务响应协议无法识别',
);
export const businessFailure = () => new MobileJwError(
  'business', ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '移动教务暂未提供所请求的数据',
);

export function isSessionExpired(status: number, body: unknown): boolean {
  // 官方脚本使用字符串 "401"；真实无效 Token fixture 为 HTTP 500 + code="401"。
  return status === 401 || ([200, 500].includes(status) && !!body && typeof body === 'object'
    && (body as Record<string, unknown>).code === '401');
}

export function assertHttpSuccess(status: number): void {
  if (status === 401) throw credentialRejected();
  if (status >= 500) throw new MobileJwError(
    'unavailable', ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '移动教务服务暂不可用',
  );
  if (status < 200 || status >= 300) throw businessFailure();
}

export function normalizeFailure(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (/\bREQUEST_TIMEOUT\b/.test(errorFacts(error))) return new MobileJwError(
    'timeout', ErrorCode.UPSTREAM_TIMEOUT, '移动教务请求超时',
  );
  if (isTransientTransportError(error) || isTemporaryCredentialFailure(error)) return new MobileJwError(
    'unavailable', ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '移动教务连接暂不可用',
  );
  // 不传播 fetch 错误中的带 token URL 或上游正文。
  return protocolFailure();
}

export function isTemporaryCredentialFailure(error: unknown): boolean {
  return error instanceof Error && /^(?:CAS|PORTAL)_[A-Z_]*HTTP_(?:500|502|503|504)$/.test(error.message);
}
