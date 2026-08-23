/**
 * [INPUT]: 依赖 mobile-yxt 上游 JSON envelope 与调用方提供的低敏感操作标签
 * [OUTPUT]: 对外提供 requireMobileYxtResultData，只接受显式 success=true 且包含 resultData 的合法 envelope
 * [POS]: mobile-yxt 的共享 envelope 纯解析边界；认证失效只由 session-executor 判定，本文件不得扩张会话规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { mobileYxtBusinessFailure, mobileYxtProtocolFailure } from './mobile-yxt-errors';

export function requireMobileYxtResultData(body: unknown, operation: string): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw mobileYxtProtocolFailure(operation, 'envelope_invalid');
  }
  const envelope = body as Record<string, unknown>;
  if (envelope.success === false) {
    throw mobileYxtBusinessFailure(operation);
  }
  if (envelope.success !== true || !Object.prototype.hasOwnProperty.call(envelope, 'resultData')) {
    throw mobileYxtProtocolFailure(operation, 'envelope_invalid');
  }
  return envelope.resultData;
}
