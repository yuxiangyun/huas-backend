import { CookieJar } from 'tough-cookie';
import { config, USER_AGENT } from '../config';

export class HttpClient {
  public jar: CookieJar;
  private defaultTimeout: number;

  constructor(jar?: CookieJar, timeout?: number) {
    this.jar = jar || new CookieJar();
    this.defaultTimeout = timeout || config.timeout.business;
  }

  setTimeout(ms: number): void {
    this.defaultTimeout = ms;
  }

  static fromSerializedJar(jarJson: string): HttpClient {
    const jar = CookieJar.fromJSON(jarJson);
    return new HttpClient(jar);
  }

  serializeJar(): string {
    return JSON.stringify(this.jar.toJSON());
  }

  async request(url: string, options: RequestInit & { isAuthFlow?: boolean; timeout?: number } = {}): Promise<Response> {
    const headers = new Headers(options.headers || {});
    headers.set('User-Agent', USER_AGENT);

    const cookieStr = await this.jar.getCookieString(url);
    if (cookieStr) headers.set('Cookie', cookieStr);

    const controller = new AbortController();
    const timeout = options.timeout || this.defaultTimeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });

      // Save cookies
      let setCookies: string[] = [];
      if (typeof res.headers.getSetCookie === 'function') {
        setCookies = res.headers.getSetCookie();
      } else {
        const raw = res.headers.get('set-cookie');
        if (raw) setCookies = [raw];
      }
      for (const c of setCookies) {
        try {
          await this.jar.setCookie(c, url);
        } catch {
          // ignore invalid cookies
        }
      }

      // Detect session expiry (skip during auth flow)
      if (!options.isAuthFlow) {
        if (res.status === 401 || res.status === 403 ||
          (res.status === 302 && res.headers.get('location')?.includes('cas/login'))) {
          throw new Error('SESSION_EXPIRED');
        }
      }

      return res;
    } catch (e: any) {
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        throw new Error('REQUEST_TIMEOUT');
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async followRedirects(url: string, max = 10): Promise<{ success: boolean; finalStatus: number }> {
    let current = url;
    let lastStatus = 0;

    for (let i = 0; i < max; i++) {
      let res: Response;
      try {
        res = await this.request(current, { isAuthFlow: true });
      } catch {
        return { success: false, finalStatus: 0 };
      }

      lastStatus = res.status;

      if ([301, 302, 303, 307].includes(res.status)) {
        const loc = res.headers.get('location');
        if (!loc) break;
        current = new URL(loc, current).toString();
      } else {
        break;
      }
    }

    return { success: lastStatus === 200, finalStatus: lastStatus };
  }
}
