/**
 * [INPUT]: 依赖 LoginCommand 应用输入契约
 * [OUTPUT]: 对外提供 LoginRequestDto 与 parseLoginRequestDto 请求结构校验
 * [POS]: identity/http 的输入边界，只接受旧 `/auth/login` 已公开字段并拒绝缺失用户名/密码
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { LoginCommand } from '../application/login-application.service';

export type LoginRequestDto = LoginCommand;

export function parseLoginRequestDto(value: unknown): LoginRequestDto | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (!body.username || !body.password) return null;
  return {
    username: String(body.username),
    password: String(body.password),
    ...(body.captcha ? { captcha: String(body.captcha) } : {}),
    ...(body.sessionId ? { sessionId: String(body.sessionId) } : {}),
  };
}
