import { HttpClient } from '../core/http-client';
import { CryptoHelper } from '../utils/crypto';
import { URLS } from '../core/url-config';
import { config } from '../config';
import type { LoginStep } from '../utils/logger';

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
    return res.arrayBuffer();
  }

  async getExecution(): Promise<string | null> {
    const res = await this.client.request(
      `${URLS.login}?service=${encodeURIComponent(URLS.servicePortal)}`,
      { isAuthFlow: true, timeout: config.timeout.cas }
    );
    const html = await res.text();
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
    const pubKey = await resKey.text();
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
    const needCaptcha = /验证码(不能为空|错误|失效|不正确)/i.test(text);
    if (needCaptcha) return { success: false, needCaptcha: true, message: '验证码错误', steps };

    return { success: false, needCaptcha: false, message: '密码错误', steps };
  }
}
