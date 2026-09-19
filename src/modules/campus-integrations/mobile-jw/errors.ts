/**
 * [INPUT]: 依赖 AppError/ErrorCode 与已验证的 mobile-jw 协议响应
 * [OUTPUT]: 对外提供 MobileJwError、低敏感错误构造和已验证的会话失效判定
 * [POS]: mobile-jw 的协议错误边界，会话拒绝仅供内部恢复且外部为 503，不冒充 CAS 交互要求
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';

type FailureKind = 'credential' | 'timeout' | 'unavailable' | 'business' | 'protocol';

export class MobileJwError extends AppError {
  constructor(public readonly kind: FailureKind, code: ErrorCode, message: string) {
    super(code, message);
  }
}

export const credentialRejected = () => new MobileJwError(
  'credential', ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '学校会话恢复后仍不可用，请稍后重试',
);
export const protocolFailure = () => new MobileJwError(
  'protocol', ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '移动教务响应协议无法识别',
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
