/**
 * [INPUT]: 依赖带剩余预算的 HttpClient、CryptoHelper、URLS、config、JW 主框架判定、统一类型化错误与 LoginStep 类型
 * [OUTPUT]: 对外提供 TicketExchanger，单次交换 Portal/JW 凭证，区分父 TGC 拒绝与目标故障，不内置重试
 * [POS]: campus-integrations/cas 的学校子凭证交换器，只被 SchoolAccess 的目标恢复协调器消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { HttpClient } from '../http/http-client';
import { SchoolAccessError, schoolTimeout } from '../school-access/errors';
import { CryptoHelper } from '../../../utils/crypto';
import { URLS } from '../endpoints';
import { config } from '../../../config';
import type { LoginStep } from '../../../utils/logger';
import { looksLikeAuthenticatedJwMainPage, looksLikeJwLoginPage } from '../jw/parsers/session-page';

export class TicketExchanger {
  private static async verifyJwSession(client: HttpClient): Promise<{
    active: boolean;
    upstreamUnavailable: boolean;
    detail: string;
  }> {
    let response = await client.request(URLS.jwMain, {
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

  /** 单次 TGC 换票，重试只由 SchoolAccess 执行器调度。 */
  static async exchangePortalToken(client: HttpClient): Promise<{
    token: string | null; steps: LoginStep[]; parentRejected?: boolean;
  }> {
    const response = await client.request(`${URLS.login}?service=${encodeURIComponent(URLS.servicePortal)}`, {
      timeout: config.timeout.cas,
    });
    if (response.status === 401) return { token: null, steps: [], parentRejected: true };
    this.assertExchangeStatus(response.status);
    const location = response.headers.get('location');
    if (!location?.includes('ticket=')) {
      const html = await response.text();
      if (/name=["']execution["']/.test(html)) return { token: null, steps: [], parentRejected: true };
      throw new SchoolAccessError('protocol', '学校门户换票响应无法识别');
    }
    const token = CryptoHelper.extractTokenFromUrl(location);
    if (!token) throw new SchoolAccessError('protocol', '学校门户未提供有效凭证');
    // 业务使用票据中的 token，不以门户页面跳转完成为获取凭证的前置条件。
    return { token, steps: [{ label: 'portal', ok: true }] };
  }

  static async exchangeJwSession(client: HttpClient): Promise<{
    success: boolean; steps: LoginStep[]; parentRejected?: boolean;
  }> {
    const response = await client.request(`${URLS.login}?service=${encodeURIComponent(URLS.serviceJw)}`, {
      timeout: config.timeout.cas,
    });
    if (response.status === 401) return { success: false, steps: [], parentRejected: true };
    this.assertExchangeStatus(response.status);
    const location = response.headers.get('location');
    if (!location) {
      const html = await response.text();
      if (/name=["']execution["']/.test(html)) return { success: false, steps: [], parentRejected: true };
      throw new SchoolAccessError('protocol', '学校教务换票响应无法识别');
    }
    const followed = await client.followRedirects(new URL(location, URLS.login).toString());
    if (!followed.success) {
      if (client.getRemainingTimeMs() <= 0) throw schoolTimeout();
      throw new SchoolAccessError('unavailable', '学校教务激活暂不可用', followed.finalStatus === 0 || followed.finalStatus >= 500);
    }
    const verification = await this.verifyJwSession(client);
    if (!verification.active) throw new SchoolAccessError('unavailable', '学校教务尚未提供有效会话', verification.upstreamUnavailable);
    return { success: true, steps: [{ label: 'jw', ok: true }] };
  }

  private static assertExchangeStatus(status: number): void {
    if (status >= 200 && status < 400) return;
    throw new SchoolAccessError(status >= 500 ? 'unavailable' : 'protocol', '学校换票服务暂不可用', status >= 500);
  }
}
