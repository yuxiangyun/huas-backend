import { HttpClient } from '../core/http-client';
import { CredentialManager, type CredentialSystem } from '../auth/credential-manager';
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

  // First attempt
  let ctx = await buildContext();
  if (!ctx) {
    throw new AppError(ErrorCode.CREDENTIAL_EXPIRED, '凭证已过期，请重新登录');
  }

  try {
    return await fn(ctx);
  } catch (e: any) {
    if (e.message === 'SESSION_EXPIRED') {
      // Invalidate the stale credential, then let the refresh chain handle recovery
      Logger.warn('Upstream', `${system} 会话过期, 重试中`, undefined, String(userId));
      await CredentialManager.invalidate(userId, system);
      if (mode === 'portal') {
        await CredentialManager.invalidate(userId, 'portal_jwt');
      }

      // Second attempt — buildContext triggers getOrRefreshCredential → refreshFromTGC → silentReAuth
      ctx = await buildContext();
      if (!ctx) {
        throw new AppError(ErrorCode.CREDENTIAL_EXPIRED, '凭证刷新失败，请重新登录');
      }
      return await fn(ctx);
    }

    throw e; // Other errors pass through
  }
}
