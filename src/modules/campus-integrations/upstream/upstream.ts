/**
 * [INPUT]: 依赖校园 HttpClient、CredentialManager、有截止时间的 retry、config 与统一错误/日志能力
 * [OUTPUT]: 对外提供 UpstreamContext、UpstreamExecutionOptions 与 upstream()，执行有界凭证恢复、瞬态重试和会话过期重建
 * [POS]: campus-integrations/upstream 的统一执行边界，为 Portal/JW 适配器屏蔽凭证生命周期并落实请求级总预算
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { HttpClient } from '../http/http-client';
import { CredentialManager, type CredentialSystem } from '../credential-recovery/credential-manager';
import { retryAsync } from '../http/retry';
import { config } from '../../../config';
import { AppError, ErrorCode } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';

export interface UpstreamContext {
  client: HttpClient;
  portalToken?: string;
}

export interface UpstreamExecutionOptions {
  totalTimeoutMs?: number;
  credentialMaxAttempts?: number;
  requestMaxAttempts?: number;
  isRetryableError?: (error: unknown) => boolean;
}

/**
 * Wraps an upstream request with automatic credential recovery.
 *
 * Flow:
 *   1. Build client from stored credentials, optionally retrying transient recovery failures
 *   2. Execute the request with finite transient retries
 *   3. If SESSION_EXPIRED → invalidate stale credential → rebuild (triggers refresh chain + silent re-auth) → retry once
 *   4. Stop starting new work when the request deadline or attempt limits are exhausted
 *   5. If rebuild yields no credential → throw CREDENTIAL_EXPIRED to the client
 */
export async function upstream<T>(
  userId: number,
  mode: 'jw' | 'portal',
  fn: (ctx: UpstreamContext) => Promise<T>,
  options: UpstreamExecutionOptions = {},
): Promise<T> {
  const system: CredentialSystem = mode === 'jw' ? 'jw_session' : 'portal_jwt';
  const totalTimeoutMs = options.totalTimeoutMs && options.totalTimeoutMs > 0
    ? Math.floor(options.totalTimeoutMs)
    : undefined;
  const deadlineAt = totalTimeoutMs === undefined ? undefined : Date.now() + totalTimeoutMs;
  const credentialMaxAttempts = Math.max(1, Math.floor(options.credentialMaxAttempts ?? 1));
  const requestMaxAttempts = Math.max(
    1,
    Math.floor(options.requestMaxAttempts ?? config.retry.businessMaxAttempts),
  );

  const buildContext = async (): Promise<UpstreamContext | null> => {
    if (mode === 'jw') {
      const client = await CredentialManager.buildHttpClient(userId, 'jw_session', deadlineAt);
      return client ? { client } : null;
    } else {
      const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt', deadlineAt);
      if (!cred?.value) return null;
      const client = await CredentialManager.buildHttpClient(userId, 'portal_jwt', deadlineAt);
      if (!client) return null;
      return { client, portalToken: cred.value };
    }
  };

  const isTransientRetryableError = (error: unknown): boolean => {
    const msg = String((error as any)?.message || '');
    if (!msg || msg === 'SESSION_EXPIRED') return false;
    if (error instanceof AppError) return error.code === ErrorCode.UPSTREAM_TIMEOUT;

    if (msg === 'REQUEST_TIMEOUT') return true;
    if (/ECONNRESET|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|fetch failed|network/i.test(msg)) return true;
    return options.isRetryableError?.(error) === true;
  };

  const retryOptions = (
    attempts: number,
    operation: '凭证恢复' | '上游请求',
  ) => ({
    attempts,
    baseDelayMs: config.retry.businessBaseDelayMs,
    maxDelayMs: config.retry.businessMaxDelayMs,
    jitterMs: config.retry.businessJitterMs,
    deadlineAt,
    createDeadlineError: () => new Error('REQUEST_TIMEOUT'),
    shouldRetry: (error: unknown) => isTransientRetryableError(error),
    onRetry: (error: unknown, attempt: number, delayMs: number) => {
      const msg = String((error as any)?.message || 'UNKNOWN_ERROR');
      Logger.warn(
        'Upstream',
        `${system} ${operation}异常，准备第 ${attempt + 1} 次尝试`,
        `${msg}; delay=${delayMs}ms`,
        String(userId)
      );
    },
  });

  const buildContextWithRetry = async (): Promise<UpstreamContext | null> => retryAsync(
    buildContext,
    retryOptions(credentialMaxAttempts, '凭证恢复'),
  );

  const executeWithRetry = async (ctx: UpstreamContext): Promise<T> => {
    return retryAsync(
      () => fn(ctx),
      retryOptions(requestMaxAttempts, '上游请求'),
    );
  };

  // First attempt
  let ctx = await buildContextWithRetry();
  if (!ctx) {
    throw new AppError(ErrorCode.CREDENTIAL_EXPIRED, '凭证已过期，请重新登录');
  }

  try {
    return await executeWithRetry(ctx);
  } catch (e: any) {
    if (e.message === 'SESSION_EXPIRED') {
      // Invalidate the stale credential, then let the refresh chain handle recovery
      Logger.warn('Upstream', `${system} 会话过期, 重试中`, undefined, String(userId));
      await CredentialManager.invalidate(userId, system);

      // Second attempt — buildContext triggers getOrRefreshCredential → refreshFromTGC → silentReAuth
      ctx = await buildContextWithRetry();
      if (!ctx) {
        throw new AppError(ErrorCode.CREDENTIAL_EXPIRED, '凭证刷新失败，请重新登录');
      }
      return await executeWithRetry(ctx);
    }

    throw e; // Other errors pass through
  }
}
