/**
 * [INPUT]: 依赖 shared/api/http-client 的无用户 JWT 请求能力
 * [OUTPUT]: 提供无自动过期字段的 AdminSession 类型及后台会话登录、探测、退出函数
 * [POS]: features/admin-treehole 的后台认证模型，只持有公开会话信息，凭据由 HttpOnly Cookie 承载
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { apiRequest } from '@/shared/api/http-client';

export interface AdminSession {
  username: string;
  expiresInSeconds: null;
}

export function createAdminSession(username: string, password: string) {
  return apiRequest<AdminSession>(
    '/api/admin/session',
    { method: 'POST', body: JSON.stringify({ username: username.trim(), password }) },
    { auth: false }
  );
}

export function readAdminSession() {
  return apiRequest<AdminSession>('/api/admin/session', {}, { auth: false });
}

export function clearAdminSession() {
  return apiRequest<{ revoked: true }>('/api/admin/session', { method: 'DELETE' }, { auth: false });
}
