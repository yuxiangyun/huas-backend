/**
 * [INPUT]: 依赖带剩余预算的 HttpClient、CryptoHelper、URLS、config、JW 主框架判定与 LoginStep 类型
 * [OUTPUT]: 对外提供 TicketExchanger，在客户端 deadline 内执行 TGC 到 Portal JWT/JW Session 的交换并验证 JW 已登录主框架
 * [POS]: campus-integrations/cas 的学校子凭证交换器，被登录流程和有界凭证恢复链消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { HttpClient } from '../http/http-client';
import { CryptoHelper } from '../../../utils/crypto';
import { URLS } from '../endpoints';
import { config } from '../../../config';
import type { LoginStep } from '../../../utils/logger';
import { looksLikeAuthenticatedJwMainPage, looksLikeJwLoginPage } from '../jw/parsers/session-page';

export class TicketExchanger {
  private static isTransientUpstreamError(message: string): boolean {
    if (!message) return false;
    if (message === 'REQUEST_TIMEOUT') return true;
    return /ECONNRESET|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|fetch failed|network/i.test(message);
  }

  private static async verifyJwSession(client: HttpClient): Promise<{
    active: boolean;
    upstreamUnavailable: boolean;
    detail: string;
  }> {
    let response = await client.request(URLS.jwMain, {
      isAuthFlow: true,
      timeout: config.timeout.cas,
    });

    const location = response.headers.get('location');
    if (location) {
      const followed = await client.followRedirects(new URL(location, URLS.jwMain).toString());
      if (!followed.success) {
        return {
          active: false,
          upstreamUnavailable: followed.finalStatus === 0 || followed.finalStatus >= 500,
          detail: `JW首页重定向失败:${followed.finalStatus}`,
        };
      }
      response = await client.request(URLS.jwMain, {
        isAuthFlow: true,
        timeout: config.timeout.cas,
      });
    }

    if (response.status < 200 || response.status >= 300) {
      return {
        active: false,
        upstreamUnavailable: response.status >= 500,
        detail: `JW首页状态:${response.status}`,
      };
    }

    const html = await response.text();
    if (looksLikeAuthenticatedJwMainPage(html)) {
      return { active: true, upstreamUnavailable: false, detail: '' };
    }

    return {
      active: false,
      upstreamUnavailable: false,
      detail: looksLikeJwLoginPage(html) ? 'JW首页仍为登录页' : 'JW首页缺少已登录标记',
    };
  }

  /**
   * TGC -> Portal JWT
   * Follow CAS redirect to portal, extract idToken from ticket
   */
  static async exchangePortalToken(client: HttpClient): Promise<{ token: string | null; steps: LoginStep[] }> {
    const steps: LoginStep[] = [];
    try {
      const loginUrl = `${URLS.login}?service=${encodeURIComponent(URLS.servicePortal)}`;
      const res = await client.request(loginUrl, {
        isAuthFlow: true,
        timeout: config.timeout.cas,
      });

      const loc = res.headers.get('location');
      if (loc?.includes('ticket=')) {
        const token = CryptoHelper.extractTokenFromUrl(loc);
        await client.followRedirects(loc);
        steps.push({ label: 'portal', ok: true });
        return { token, steps };
      }

      steps.push({ label: 'portal', ok: false, detail: 'No ticket in redirect' });
      return { token: null, steps };
    } catch (e: any) {
      const detail = String(e?.message || '');
      steps.push({ label: 'portal', ok: false, detail });
      if (this.isTransientUpstreamError(detail)) throw e;
      return { token: null, steps };
    }
  }

  /**
   * TGC -> JW JSESSIONID
   * Follow CAS -> SSO -> JW redirect chain with retry
   */
  static async exchangeJwSession(client: HttpClient): Promise<{
    success: boolean;
    steps: LoginStep[];
    upstreamUnavailable?: boolean;
  }> {
    const steps: LoginStep[] = [];
    let activated = false;
    let upstreamUnavailable = false;

    for (let attempt = 0; attempt < config.retry.jwActivationMax && !activated; attempt++) {
      if (client.getRemainingTimeMs() <= 0) {
        upstreamUnavailable = true;
        break;
      }
      if (attempt > 0) {
        if (client.getRemainingTimeMs() <= config.retry.jwActivationDelay) {
          upstreamUnavailable = true;
          break;
        }
        await new Promise(r => setTimeout(r, config.retry.jwActivationDelay));
      }

      try {
        const jwUrl = `${URLS.login}?service=${encodeURIComponent(URLS.serviceJw)}`;
        const jwRes = await client.request(jwUrl, {
          isAuthFlow: true,
          timeout: config.timeout.cas,
        });

        const jwLoc = jwRes.headers.get('location');
        if (jwLoc) {
          const result = await client.followRedirects(jwLoc);
          if (result.success) {
            const verification = await this.verifyJwSession(client);
            if (verification.active) {
              activated = true;
              steps.push({ label: `jw${attempt > 0 ? '#' + (attempt + 1) : ''}`, ok: true });
            } else {
              upstreamUnavailable ||= verification.upstreamUnavailable;
              steps.push({
                label: `jw#${attempt + 1}`,
                ok: false,
                detail: verification.detail,
              });
            }
          } else {
            if (result.finalStatus === 0) {
              upstreamUnavailable = true;
            }
            steps.push({ label: `jw#${attempt + 1}`, ok: false, detail: `status:${result.finalStatus}` });
          }
        } else {
          steps.push({ label: `jw#${attempt + 1}`, ok: false, detail: 'SSO未重定向' });
        }
      } catch (e: any) {
        const detail = String(e?.message || '');
        if (this.isTransientUpstreamError(detail)) {
          upstreamUnavailable = true;
        }
        steps.push({ label: `jw#${attempt + 1}`, ok: false, detail });
      }
    }

    return { success: activated, steps, upstreamUnavailable: !activated && upstreamUnavailable };
  }
}
