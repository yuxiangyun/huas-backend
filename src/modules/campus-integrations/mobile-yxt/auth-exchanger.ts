/**
 * [INPUT]: 依赖 Portal JWT、隔离 HttpClient、共享最小 CookieJar codec、mobile-yxt 认证端点与类型化错误语义
 * [OUTPUT]: 对外提供 MobileYxtAuthExchanger，把 Portal JWT 交换为 accessToken 与经统一合同编码的单 JSESSIONID CookieJar
 * [POS]: mobile-yxt 的认证交换边界；输入 Portal/CAS CookieJar 永不复制，tid/refreshToken 只存在于单次调用内，Cookie 白名单不在此重复
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { HttpClient } from '../http/http-client';
import { URLS } from '../endpoints';
import {
  assertMobileYxtHttpSuccess,
  mobileYxtCredentialRejected,
  mobileYxtProtocolFailure,
  normalizeMobileYxtTransportError,
} from './mobile-yxt-errors';
import { encodeMobileYxtCookieJar } from './session-cookie-codec';

export interface MobileYxtSessionExchange {
  accessToken: string;
  cookieJar: string;
}

export interface MobileYxtSessionExchangePort {
  exchange(portalClient: HttpClient, portalJwt: string, deadlineAt?: number): Promise<MobileYxtSessionExchange>;
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw mobileYxtProtocolFailure();
  }
  return value as Record<string, unknown>;
}

export class MobileYxtAuthExchanger implements MobileYxtSessionExchangePort {
  async exchange(_portalClient: HttpClient, portalJwt: string, deadlineAt?: number): Promise<MobileYxtSessionExchange> {
    // 权限隔离点：绝不复用输入客户端的 CAS TGC 或 Portal CookieJar。
    const mobileClient = new HttpClient();
    mobileClient.setDeadline(deadlineAt);
    try {
      const openUrl = new URL(URLS.mobileYxtHostOpen);
      openUrl.searchParams.set('host', '11');
      openUrl.searchParams.set('org', '2');
      openUrl.searchParams.set('token', portalJwt);

      const openResponse = await mobileClient.request(openUrl.toString(), { isAuthFlow: true });
      if (openResponse.status === 401) throw mobileYxtCredentialRejected();
      if (openResponse.status !== 302) {
        assertMobileYxtHttpSuccess(openResponse.status);
        throw mobileYxtProtocolFailure();
      }

      const location = openResponse.headers.get('location');
      if (!location) throw mobileYxtProtocolFailure();
      let tid = '';
      try {
        tid = new URL(location, URLS.mobileYxtHostOpen).searchParams.get('tid')?.trim() || '';
      } catch {
        throw mobileYxtProtocolFailure();
      }
      if (!tid) throw mobileYxtProtocolFailure();

      const tokenResponse = await mobileClient.request(URLS.mobileYxtGetToken, {
        method: 'POST',
        isAuthFlow: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tid }),
      });
      assertMobileYxtHttpSuccess(tokenResponse.status);

      let body: unknown;
      try {
        body = await tokenResponse.json();
      } catch {
        throw mobileYxtProtocolFailure();
      }
      const envelope = requireObject(body);
      if (envelope.success !== true) throw mobileYxtProtocolFailure();
      const resultData = requireObject(envelope.resultData);
      const accessToken = typeof resultData.accessToken === 'string'
        ? resultData.accessToken.trim()
        : '';
      if (!accessToken) throw mobileYxtProtocolFailure();

      return {
        accessToken,
        cookieJar: await encodeMobileYxtCookieJar(mobileClient.jar),
      };
    } catch (error) {
      throw normalizeMobileYxtTransportError(error);
    }
  }
}
