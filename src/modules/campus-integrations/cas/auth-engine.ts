/**
 * [INPUT]: 依赖 HttpClient、CryptoHelper、URLS、config 与 LoginStep 类型
 * [OUTPUT]: 对外提供 AuthEngine，封装 CAS 验证码、execution、登录提交及结构化失败原因识别
 * [POS]: campus-integrations/cas 的原始登录执行器，区分验证码错误、登录凭证拒绝与真实上游故障
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { HttpClient } from '../http/http-client';
import { CryptoHelper } from '../../../utils/crypto';
import { URLS } from '../endpoints';
import { config } from '../../../config';
import type { LoginStep } from '../../../utils/logger';

function assertCasHttpResponse(response: Response, operation: string, allowRedirect = false) {
  if (response.status >= 200 && response.status < 300) return;
  if (allowRedirect && response.status >= 300 && response.status < 400) return;
  throw new Error(`${operation}_HTTP_${response.status}`);
}

function assertNotCasErrorPage(text: string) {
  if (/Whitelabel Error Page|Internal Server Error|HTTP Status 5\d\d|系统维护|系统异常|服务暂不可用/.test(text)) {
    throw new Error('CAS_MAINTENANCE');
  }
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCasLoginError(html: string): string | null {
  const passwordLoginBlock = html.match(
    /var\s+currentMenu\s*=\s*["']1["'][\s\S]{0,5000}?var\s+errors\s*=\s*(\[[\s\S]*?\])\s*;/i,
  );
  if (passwordLoginBlock?.[1]) {
    try {
      const errors = JSON.parse(passwordLoginBlock[1]);
      if (Array.isArray(errors) && typeof errors[0] === 'string') {
        const message = decodeHtmlText(errors[0]);
        if (message) return message;
      }
    } catch {
      // 非标准脚本继续尝试服务端渲染的错误容器。
    }
  }

  const errorContainer = html.match(/<[^>]+id=["']loginError1["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  return errorContainer?.[1] ? decodeHtmlText(errorContainer[1]) || null : null;
}

function isCaptchaFailure(message: string): boolean {
  return /验证码[^，。；;]*(?:为空|不能为空|错误|有误|失效|过期|不正确|无效)|(?:请输入|填写)验证码/i.test(message);
}

function describeCaptchaFailure(message: string): string {
  if (/失效|过期/.test(message)) return '验证码已失效，请重新输入';
  if (/为空|不能为空|请输入|填写/.test(message)) return '请输入验证码';
  return '验证码错误，请重新输入';
}

export class AuthEngine {
  private client: HttpClient;

  constructor(client: HttpClient) {
    this.client = client;
  }

  async getCaptcha(): Promise<ArrayBuffer> {
    const res = await this.client.request(
      `${URLS.captcha}?r=${Date.now()}`,
      { isAuthFlow: true, timeout: config.timeout.cas }
    );
    assertCasHttpResponse(res, 'CAS_CAPTCHA');
    return res.arrayBuffer();
  }

  async getExecution(): Promise<string | null> {
    const res = await this.client.request(
      `${URLS.login}?service=${encodeURIComponent(URLS.servicePortal)}`,
      { isAuthFlow: true, timeout: config.timeout.cas }
    );
    assertCasHttpResponse(res, 'CAS_EXECUTION');
    const html = await res.text();
    assertNotCasErrorPage(html);
    const match = html.match(/name="execution" value="([^"]+)"/);
    return match ? match[1] : null;
  }

  async login(
    username: string,
    password: string,
    captcha: string,
    execution: string
  ): Promise<{
    success: boolean;
    message?: string;
    needCaptcha?: boolean;
    portalToken?: string | null;
    steps?: LoginStep[];
  }> {
    const steps: LoginStep[] = [];

    // 1. Get public key & encrypt password
    const resKey = await this.client.request(URLS.pubkey, {
      isAuthFlow: true,
      timeout: config.timeout.cas,
    });
    assertCasHttpResponse(resKey, 'CAS_PUBKEY');
    const pubKey = await resKey.text();
    assertNotCasErrorPage(pubKey);
    const encryptedPw = CryptoHelper.encryptPassword(password, pubKey);
    if (!encryptedPw) return { success: false, message: 'Encryption failed', steps };

    // 2. Submit login
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', encryptedPw);
    params.append('currentMenu', '1');
    params.append('execution', execution);
    params.append('_eventId', 'submit');
    params.append('submit1', 'Login1');
    params.append('failN', '0');
    if (captcha) params.append('captcha', captcha);

    const loginUrl = `${URLS.login}?service=${encodeURIComponent(URLS.servicePortal)}`;
    const res = await this.client.request(loginUrl, {
      method: 'POST',
      body: params,
      isAuthFlow: true,
      timeout: config.timeout.cas,
      headers: { 'Referer': loginUrl },
    });

    // CAS 以 401 表达凭证拒绝；这是登录结果，不是服务故障。
    // 其他 4xx/5xx 仍需抛出，避免把网关或维护故障误报成密码错误。
    if (res.status !== 401) assertCasHttpResponse(res, 'CAS_LOGIN', true);

    if (res.status === 302) {
      const loc = res.headers.get('location');
      if (loc?.includes('ticket=')) {
        // Extract portal token from ticket
        const portalToken = CryptoHelper.extractTokenFromUrl(loc);
        await this.client.followRedirects(loc);
        steps.push({ label: 'portal', ok: true });

        // Return TGC state (cookie jar) + portal token
        // Ticket exchange (JW activation) is handled separately by TicketExchanger
        return { success: true, portalToken, steps };
      }
    }

    // Login failed
    const text = await res.text();
    assertNotCasErrorPage(text);
    const casError = extractCasLoginError(text);
    const captchaFailure = casError
      ? isCaptchaFailure(casError)
      : !captcha && /验证码(不能为空|错误|失效|不正确)/i.test(text);
    if (captchaFailure) {
      return {
        success: false,
        needCaptcha: true,
        message: describeCaptchaFailure(casError || '验证码错误'),
        steps,
      };
    }

    return { success: false, needCaptcha: false, message: '账号或密码错误', steps };
  }
}
