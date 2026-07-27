/**
 * [INPUT]: 依赖 tough-cookie CookieJar、config.timeout、USER_AGENT 与外层注入的低基数请求结果 observer
 * [OUTPUT]: 对外提供 HttpClient 与 configureHttpClientObservers，封装会话 HTTP 及最终 success/failure/timeout 观测
 * [POS]: campus-integrations/http 的学校上游 HTTP 客户端，是 CAS、Portal、JW 会话通信的唯一实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { CookieJar } from 'tough-cookie';
import { config, USER_AGENT } from '../../../config';

export type HttpClientOutcome = 'success' | 'failure' | 'timeout';

export interface HttpClientObservers {
  recordOutcome?: (outcome: HttpClientOutcome) => void;
}

let observers: HttpClientObservers = {};

export function configureHttpClientObservers(next: HttpClientObservers) {
  const previous = observers;
  observers = next;
  return () => {
    observers = previous;
  };
}

function recordOutcome(outcome: HttpClientOutcome) {
  try {
    observers.recordOutcome?.(outcome);
  } catch {
    // 观测异常不得改变学校请求、重试或凭证恢复语义。
  }
}

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

      recordOutcome(res.status < 400 ? 'success' : 'failure');
      return res;
    } catch (e: any) {
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        recordOutcome('timeout');
        throw new Error('REQUEST_TIMEOUT');
      }
      recordOutcome('failure');
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
