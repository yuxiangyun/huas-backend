/**
 * [INPUT]: 依赖 tough-cookie CookieJar 与 mobile-yxt 目标端点，接收认证交换或 SQLite 中的序列化 Jar
 * [OUTPUT]: 对外提供最小 JSESSIONID CookieJar 的提取、反序列化验证与无敏感正文的协议错误
 * [POS]: mobile-yxt 的 Cookie 权限单一事实源；exchanger 负责产出、repository/executor 负责读取，三者共享同一严格合同
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { CookieJar } from 'tough-cookie';
import { URLS } from '../endpoints';
import { mobileYxtProtocolFailure } from './mobile-yxt-errors';

const TARGET_URL = URLS.mobileYxtTradeList;
const TARGET_HOST = new URL(TARGET_URL).hostname;
const TARGET_PATH = '/server';
const COOKIE_NAME = 'JSESSIONID';
const SERIALIZED_JAR_KEYS = new Set([
  'version',
  'storeType',
  'rejectPublicSuffixes',
  'enableLooseMode',
  'allowSpecialUseDomain',
  'prefixSecurity',
  'cookies',
]);
const SERIALIZED_COOKIE_KEYS = new Set([
  'key',
  'value',
  'expires',
  'maxAge',
  'domain',
  'path',
  'secure',
  'httpOnly',
  'extensions',
  'hostOnly',
  'pathIsDefault',
  'creation',
  'lastAccessed',
  'sameSite',
]);

export interface DecodedMobileYxtCookieJar {
  jar: CookieJar;
  serialized: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAllowedCookie(cookie: {
  key?: string;
  value?: string;
  domain?: string | null;
  path?: string | null;
  hostOnly?: boolean | null;
}): boolean {
  return cookie.key === COOKIE_NAME
    && typeof cookie.value === 'string'
    && cookie.value.length > 0
    && cookie.domain === TARGET_HOST
    && cookie.path === TARGET_PATH
    && cookie.hostOnly === true;
}

function createMinimalJar(cookieString: string): DecodedMobileYxtCookieJar {
  const jar = new CookieJar();
  jar.setCookieSync(cookieString, TARGET_URL);
  const serialized = JSON.stringify(jar.toJSON());
  return { jar, serialized };
}

export async function encodeMobileYxtCookieJar(source: CookieJar): Promise<string> {
  const cookies = await source.getCookies(TARGET_URL);
  const allowed = cookies.filter(isAllowedCookie);
  if (allowed.length !== 1) throw mobileYxtProtocolFailure();
  return createMinimalJar(allowed[0].toString()).serialized;
}

export function decodeMobileYxtCookieJar(
  serialized: string,
): DecodedMobileYxtCookieJar | null {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed) || !Object.keys(parsed).every((key) => SERIALIZED_JAR_KEYS.has(key))) {
      return null;
    }
    if (!Array.isArray(parsed.cookies) || parsed.cookies.length !== 1) return null;
    const rawCookie = parsed.cookies[0];
    if (!isRecord(rawCookie) || !Object.keys(rawCookie).every((key) => SERIALIZED_COOKIE_KEYS.has(key))) {
      return null;
    }
    if (Array.isArray(rawCookie.extensions) && rawCookie.extensions.length > 0) return null;

    const source = CookieJar.fromJSON(parsed as Parameters<typeof CookieJar.fromJSON>[0]);
    if (!source) return null;
    const allCookies = source.toJSON()?.cookies;
    const onlyCookie = allCookies?.[0];
    if (allCookies?.length !== 1 || !onlyCookie || !isAllowedCookie(onlyCookie)) return null;
    const targetCookies = source.getCookiesSync(TARGET_URL);
    if (targetCookies.length !== 1 || !isAllowedCookie(targetCookies[0])) return null;
    return { jar: source, serialized };
  } catch {
    return null;
  }
}

export function requireMobileYxtCookieJar(serialized: string): DecodedMobileYxtCookieJar {
  const decoded = decodeMobileYxtCookieJar(serialized);
  if (!decoded) throw mobileYxtProtocolFailure();
  return decoded;
}
