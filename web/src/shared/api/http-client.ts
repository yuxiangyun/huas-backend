/**
 * [INPUT]: 依赖本模块相邻类型、API 与应用基础设施
 * [OUTPUT]: 提供 http-client.ts 的公开前端契约与运行能力
 * [POS]: web 应用分层中的现有业务边界，被页面或上层模块消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useAuthStore } from '@/entities/auth/model/auth-store';
import { buildLoginRedirectPath } from '@/app/router/redirect';
import { API_BASE_URL } from '@/shared/config/env';

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  _meta?: Record<string, unknown>;
}

interface ErrorEnvelope {
  success: false;
  error_code?: number;
  error_message?: string;
  needCaptcha?: boolean;
  sessionId?: string;
  captchaImage?: string;
}

export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

interface RequestOptions {
  auth?: boolean;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly errorCode: number | null,
    message: string,
    public readonly raw?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isFormData(body: BodyInit | null | undefined): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

async function parsePayload<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(response.status, null, '服务器响应不是有效的 JSON', text);
  }
}

function handleUnauthorized(response: Response) {
  if (response.status !== 401) return;

  useAuthStore.getState().logout();

  if (typeof window !== 'undefined') {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(buildLoginRedirectPath(currentPath));
  }
}

export async function requestEnvelope<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
) {
  const headers = new Headers(init.headers);
  headers.set('X-Client-Platform', 'web');
  const token = useAuthStore.getState().token;

  if (options.auth !== false && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (init.body && !isFormData(init.body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    signal: options.signal ?? init.signal,
  });

  const payload = await parsePayload<ApiEnvelope<T>>(response);
  if (options.auth !== false) {
    handleUnauthorized(response);
  }

  return { status: response.status, payload };
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
) {
  const { status, payload } = await requestEnvelope<T>(path, init, options);

  if (status === 401 && path.startsWith('/api/admin/') && path !== '/api/admin/session' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('huas:admin-session-expired'));
  }

  if (!payload) {
    throw new ApiError(status, null, '服务器返回了空响应');
  }

  if (!payload.success) {
    throw new ApiError(
      status,
      payload.error_code ?? null,
      payload.error_message || '请求失败',
      payload
    );
  }

  return payload.data;
}
