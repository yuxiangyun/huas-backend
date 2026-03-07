import { HttpClient } from '../core/http-client';
import { CredentialManager, type CredentialSystem } from '../auth/credential-manager';
import { retryAsync } from '../core/retry';
import { config } from '../config';
import { AppError, ErrorCode } from '../utils/errors';
import { Logger } from '../utils/logger';

export interface UpstreamContext {
  client: HttpClient;
  portalToken?: string;
}

/**
 * Wraps an upstream request with automatic credential recovery.
 *
 * Flow:
 *   1. Build client from stored credentials
 *   2. Execute the request
 *   3. If SESSION_EXPIRED → invalidate stale credential → rebuild (triggers refresh chain + silent re-auth) → retry once
 *   4. If rebuild fails → throw CREDENTIAL_EXPIRED to the client
 */
export async function upstream<T>(
  userId: number,
  mode: 'jw' | 'portal',
  fn: (ctx: UpstreamContext) => Promise<T>
): Promise<T> {
  const system: CredentialSystem = mode === 'jw' ? 'jw_session' : 'portal_jwt';

  const buildContext = async (): Promise<UpstreamContext | null> => {
    if (mode === 'jw') {
      const client = await CredentialManager.buildHttpClient(userId, 'jw_session');
      return client ? { client } : null;
    } else {
      const cred = await CredentialManager.getOrRefreshCredential(userId, 'portal_jwt');
      if (!cred?.value) return null;
      const client = await CredentialManager.buildHttpClient(userId, 'portal_jwt');
      if (!client) return null;
      return { client, portalToken: cred.value };
    }
  };

  const isTransientRetryableError = (error: unknown): boolean => {
    const msg = String((error as any)?.message || '');
    if (!msg || msg === 'SESSION_EXPIRED') return false;
    if (error instanceof AppError) return false;

    if (msg === 'REQUEST_TIMEOUT') return true;
    return /ECONNRESET|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|fetch failed|network/i.test(msg);
  };

  const executeWithRetry = async (ctx: UpstreamContext): Promise<T> => {
    return retryAsync(
      () => fn(ctx),
      {
        attempts: config.retry.businessMaxAttempts,
        baseDelayMs: config.retry.businessBaseDelayMs,
        maxDelayMs: config.retry.businessMaxDelayMs,
        jitterMs: config.retry.businessJitterMs,
        shouldRetry: (error) => isTransientRetryableError(error),
        onRetry: (error, attempt, delayMs) => {
          const msg = String((error as any)?.message || 'UNKNOWN_ERROR');
          Logger.warn(
            'Upstream',
            `${system} 上游异常，准备第 ${attempt + 1} 次请求`,
            `${msg}; delay=${delayMs}ms`,
            String(userId)
          );
        },
      }
    );
  };

  // First attempt
  let ctx = await buildContext();
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
      ctx = await buildContext();
      if (!ctx) {
        throw new AppError(ErrorCode.CREDENTIAL_EXPIRED, '凭证刷新失败，请重新登录');
      }
      return await executeWithRetry(ctx);
    }

    throw e; // Other errors pass through
  }
}
