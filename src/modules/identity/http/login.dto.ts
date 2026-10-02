/**
 * [INPUT]: 依赖 LoginCommand 应用输入契约
 * [OUTPUT]: 对外提供 LoginRequestDto 与 parseLoginRequestDto，验证必填非空字符串及已提供可选字段的字符串类型
 * [POS]: identity/http 的输入边界，只接受 `/auth/login` 已公开字段，不把非字符串载荷强转为学校认证参数
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { LoginCommand } from '../application/login-application.service';

export type LoginRequestDto = LoginCommand;

export function parseLoginRequestDto(value: unknown): LoginRequestDto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.username !== 'string' || !body.username
    || typeof body.password !== 'string' || !body.password) return null;
  if (body.captcha !== undefined && typeof body.captcha !== 'string') return null;
  if (body.sessionId !== undefined && typeof body.sessionId !== 'string') return null;
  return {
    username: body.username,
    password: body.password,
    ...(body.captcha ? { captcha: body.captcha } : {}),
    ...(body.sessionId ? { sessionId: body.sessionId } : {}),
  };
}
