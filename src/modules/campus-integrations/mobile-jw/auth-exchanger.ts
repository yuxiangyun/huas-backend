/**
 * [INPUT]: 依赖固定 URLS、干净 HttpClient、Portal JWT 与绝对请求截止时间
 * [OUTPUT]: 对外提供 MobileJwAuthExchanger 和 token-only exchange 端口
 * [POS]: mobile-jw 的 Portal→H5 认证边界，只从同源 casLogin/loginSso 跳转解析令牌，不执行脚本或持久化 Cookie
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { URLS } from '../endpoints';
import { HttpClient } from '../http/http-client';
import { assertHttpSuccess, credentialRejected, normalizeFailure, protocolFailure } from './errors';

export interface MobileJwSessionExchangePort {
  exchange(portalJwt: string, deadlineAt: number): Promise<string>;
}

const MAX_SSO_STEPS = 5;
const MAX_TOKEN_LENGTH = 16_384;

export function isValidH5Token(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH
    && value !== 'null' && value !== 'undefined'
    && !/[\s\x00-\x1f\x7f]/.test(value);
}

function requireSameOrigin(url: URL): void {
  if (url.origin !== new URL(URLS.mobileJwBase).origin || url.username || url.password) {
    throw protocolFailure();
  }
}

/** URL 只在内部解析；错误、日志及 DTO 均不持有原始 location。 */
export function readH5LoginToken(url: URL): string | null {
  requireSameOrigin(url);
  const hash = url.hash.slice(1);
  if (!hash.startsWith('/casLogin?') && !hash.startsWith('/loginSso?')) return null;
  const params = new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
  // 实测失效 Portal JWT 跳回 /#/casLogin?code=2；其他 code 保持协议错误。
  if (hash.startsWith('/casLogin?') && params.get('code') === '2') throw credentialRejected();
  const token = params.get('token') || params.get('askToken');
  if (!isValidH5Token(token)) throw protocolFailure();
  return token;
}

export class MobileJwAuthExchanger implements MobileJwSessionExchangePort {
  async exchange(portalJwt: string, deadlineAt: number): Promise<string> {
    try {
      const client = new HttpClient();
      client.setDeadline(deadlineAt);
      let url = new URL(URLS.mobileJwSso);
      url.searchParams.set('token', portalJwt);

      for (let step = 0; step < MAX_SSO_STEPS; step += 1) {
        requireSameOrigin(url);
        const token = readH5LoginToken(url);
        if (token) return token;
        const response = await client.request(url.toString(), { isAuthFlow: true });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) throw protocolFailure();
          url = new URL(location, url);
          const redirectedToken = readH5LoginToken(url);
          if (redirectedToken) return redirectedToken;
          continue;
        }
        assertHttpSuccess(response.status);
        const body = (await response.text()).trim();
        // 已有无用户上下文 fixture 的精确拒绝文本；未知 HTML/JSON 不推断为凭证失效。
        if (body === '用户获取失败！') throw credentialRejected();
        throw protocolFailure();
      }
      throw protocolFailure();
    } catch (error) {
      throw normalizeFailure(error);
    }
  }
}
