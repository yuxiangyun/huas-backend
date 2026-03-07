import { HttpClient } from '../core/http-client';
import { CryptoHelper } from '../utils/crypto';
import { URLS } from '../core/url-config';
import { config } from '../config';
import { Logger, type LoginStep } from '../utils/logger';

export class TicketExchanger {
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
      steps.push({ label: 'portal', ok: false, detail: e.message });
      return { token: null, steps };
    }
  }

  /**
   * TGC -> JW JSESSIONID
   * Follow CAS -> SSO -> JW redirect chain with retry
   */
  static async exchangeJwSession(client: HttpClient): Promise<{ success: boolean; steps: LoginStep[] }> {
    const steps: LoginStep[] = [];
    let activated = false;

    for (let attempt = 0; attempt < config.retry.jwActivationMax && !activated; attempt++) {
      if (attempt > 0) {
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
            // Visit JW main page to complete session setup
            const indexRes = await client.request('https://xyjw.huas.edu.cn/jsxsd/framework/xsMain.jsp', {
              isAuthFlow: true,
              timeout: config.timeout.cas,
            });
            const indexLoc = indexRes.headers.get('location');
            if (indexLoc) {
              await client.followRedirects(indexLoc);
            }
            activated = true;
            steps.push({ label: `jw${attempt > 0 ? '#' + (attempt + 1) : ''}`, ok: true });
          } else {
            steps.push({ label: `jw#${attempt + 1}`, ok: false, detail: `status:${result.finalStatus}` });
          }
        } else {
          steps.push({ label: `jw#${attempt + 1}`, ok: false, detail: 'SSO未重定向' });
        }
      } catch (e: any) {
        steps.push({ label: `jw#${attempt + 1}`, ok: false, detail: e.message });
      }
    }

    return { success: activated, steps };
  }
}
