/**
 * [INPUT]: 依赖隔离 SQLite、学校登录上下文、mobile-yxt 会话/认证/账单/电费边界、两类限流状态与可控 fetch
 * [OUTPUT]: 锁定登录 epoch/Portal 恢复竞态、host/open 真实过期凭证 HTML、最小 Cookie、Bun 传输错误归一化、条件 401、账单 freshness/有符号 totals、真实电费合同、同键回源合流与旧 HTTP 合同
 * [POS]: tests 的 mobile-yxt 只读专项反例套件，以最终数据库、Cookie、缓存、新鲜度和限流状态验证生产逻辑不变量
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { and, eq, like } from 'drizzle-orm';
import { CookieJar } from 'tough-cookie';
import { Hono } from 'hono';
import { generateToken } from '../src/auth/jwt';
import { getDb, schema } from '../src/db';
import {
  academicRefreshRateLimitMiddleware,
  resetAcademicRefreshRateLimitStateForTests,
} from '../src/middleware/academic-refresh-rate-limit.middleware';
import { CacheService } from '../src/modules/cache/cache-service';
import { CredentialManager } from '../src/modules/campus-integrations/credential-recovery/credential-manager';
import {
  readSchoolLoginEpoch,
} from '../src/modules/campus-integrations/credential-recovery/school-login-context';
import { URLS } from '../src/modules/campus-integrations/endpoints';
import { HttpClient } from '../src/modules/campus-integrations/http/http-client';
import {
  MobileYxtAuthExchanger,
  type MobileYxtSessionExchangePort,
} from '../src/modules/campus-integrations/mobile-yxt/auth-exchanger';
import {
  ECardOverviewService,
  MOBILE_YXT_TRANSACTION_CACHE_LIMIT,
  mobileYxtTransactionCacheKey,
  mobileYxtTransactionCachePrefix,
  type MobileYxtTradeReader,
} from '../src/modules/campus-integrations/mobile-yxt/ecard-overview-service';
import {
  ElectricityService,
  mobileYxtElectricityCacheKey,
} from '../src/modules/campus-integrations/mobile-yxt/electricity-service';
import { MobileYxtElectricityClient } from '../src/modules/campus-integrations/mobile-yxt/electricity-client';
import {
  parseElectricityAccount,
  parseElectricityConfig,
} from '../src/modules/campus-integrations/mobile-yxt/electricity-parser';
import {
  mobileYxtCredentialRejected,
  normalizeMobileYxtTransportError,
  mobileYxtProtocolFailure,
  mobileYxtTimeout,
  mobileYxtUnavailable,
} from '../src/modules/campus-integrations/mobile-yxt/mobile-yxt-errors';
import {
  MOBILE_YXT_READ_MAX_REQUESTS,
  resetMobileYxtReadRateLimitStateForTests,
} from '../src/modules/campus-integrations/mobile-yxt/read-rate-limiter';
import {
  isMobileYxtSessionExpired,
  MobileYxtSessionExecutor,
} from '../src/modules/campus-integrations/mobile-yxt/session-executor';
import {
  SqliteMobileYxtSessionRepository,
} from '../src/modules/campus-integrations/mobile-yxt/session-repository';
import { MAX_TRADE_PAGES, MobileYxtTradeClient } from '../src/modules/campus-integrations/mobile-yxt/trade-client';
import {
  MOBILE_YXT_QUERY_MONTHS,
  parseTradePage,
  resolveBeijingMonth,
  summarizeTransactions,
} from '../src/modules/campus-integrations/mobile-yxt/trade-parser';
import { SqliteIdentityStore } from '../src/modules/identity/infrastructure/sqlite-identity.store';
import { registerRoutes } from '../src/routes';
import { AppError, ErrorCode } from '../src/utils/errors';
import { Logger } from '../src/utils/logger';

let fetchSpy: ReturnType<typeof spyOn> | null = null;
const sessions = new SqliteMobileYxtSessionRepository();
const mobileUrl = URLS.mobileYxtTradeList;

async function resetDatabase() {
  await getDb().delete(schema.credentials);
  await getDb().delete(schema.cache);
  resetAcademicRefreshRateLimitStateForTests();
  resetMobileYxtReadRateLimitStateForTests();
}

async function createUser(studentId: string): Promise<number> {
  const now = new Date();
  const row = await getDb().insert(schema.users).values({
    studentId,
    name: `test-${studentId}`,
    className: 'test-class',
    createdAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
  }).returning({ id: schema.users.id });
  return row[0].id;
}

async function persistSchoolLogin(
  studentId: string,
  portalToken: string,
  jwCookieJar = '{"cookies":[{"key":"JSESSIONID","value":"jw-stable"}]}',
) {
  return new SqliteIdentityStore().commitRealSchoolLogin({
    studentId,
    encryptedPassword: 'test-encrypted-password',
    credentials: {
      casCookieJar: '{"cookies":[]}',
      portalToken,
      jwCookieJar,
    },
    at: new Date(),
  });
}

async function sessionJar(value = 'test-session'): Promise<string> {
  const jar = new CookieJar();
  await jar.setCookie(
    `JSESSIONID=${value}; Path=/server; HttpOnly`,
    URLS.mobileYxtGetToken,
  );
  return JSON.stringify(jar.toJSON());
}

function currentMonthOffset(offset: number): string {
  const now = new Date();
  const current = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const [year, month] = current.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 - offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

const portalBalance = {
  async getECard() {
    return { data: { balance: 12.34, status: '正常' } };
  },
};

const emptyTrades: MobileYxtTradeReader = {
  async listMonth() {
    return { transactions: [], truncated: false };
  },
};

const noQuota = { consume() {} };

function electricityConfig(location: Record<string, unknown> | null = {
  bigArea: '',
  area: '102',
  building: '16',
  unit: '',
  level: '104',
  room: '102-16--104-418',
  subArea: '',
  areaName: '西校区',
  buildingName: '九舍',
  levelName: null,
  roomName: '418',
}) {
  return {
    success: true,
    resultData: {
      location,
      detailConfig: { enabled: false, lastMonth: null, supportAllRoom: false },
      templateList: [],
    },
  };
}

function parseElectricityFixture(configBody: unknown, accountBody: unknown) {
  return parseElectricityAccount(parseElectricityConfig(configBody), accountBody);
}

function electricityAccount(templateList: Array<Record<string, unknown>> = [
  { code: 'ykt_balance', name: '校园卡余额', unit: '元', show: true, value: '12.34' },
  { code: 'price', name: '电价', unit: '元/度', show: true, value: '0.62' },
  { code: 'quantity', name: '剩余电量', unit: '度', show: true, value: '-11.10' },
  { code: 'balance', name: '电费余额', unit: '元', show: true, value: '-6.88' },
]) {
  return {
    success: true,
    resultData: {
      balance: '12.34',
      accStatus: '1',
      accStatusName: '正常',
      utilityStatus: '1',
      utilityStatusName: '供电',
      supportDetails: false,
      utilityAccount: 'virtual-account',
      utilityUsername: '测试用户',
      templateList,
    },
  };
}

beforeEach(resetDatabase);
afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = null;
});

describe('学校登录 epoch 与模块会话仓储', () => {
  it('新学校登录没有取得 Portal JWT 时删除旧值，禁止旧 token 进入新 epoch', async () => {
    const studentId = 'mobile-no-inherited-portal';
    const first = await persistSchoolLogin(studentId, 'portal-old');
    const firstEpoch = readSchoolLoginEpoch(getDb(), first.id);

    await new SqliteIdentityStore().commitRealSchoolLogin({
      studentId,
      encryptedPassword: 'new-encrypted-password',
      credentials: {
        casCookieJar: '{"cookies":[]}',
        portalToken: null,
        jwCookieJar: '{"cookies":[{"key":"JSESSIONID","value":"jw-new"}]}',
      },
      at: new Date(),
    });

    expect(readSchoolLoginEpoch(getDb(), first.id)).toBe(firstEpoch + 1);
    expect(await CredentialManager.getCredential(first.id, 'portal_jwt')).toBeNull();
  });

  it('旧 Portal exchange 进行中发生真实登录，迟到结果不能写回数据库', async () => {
    const studentId = 'mobile-epoch-race';
    const user = await persistSchoolLogin(studentId, 'portal-old');
    let releaseOld!: () => void;
    let oldStarted!: () => void;
    const oldStartedPromise = new Promise<void>((resolve) => { oldStarted = resolve; });
    const releaseOldPromise = new Promise<void>((resolve) => { releaseOld = resolve; });
    const seenPortalTokens: string[] = [];
    const exchanger: MobileYxtSessionExchangePort = {
      async exchange(_client, portalJwt) {
        seenPortalTokens.push(portalJwt);
        if (portalJwt === 'portal-old') {
          oldStarted();
          await releaseOldPromise;
        }
        return {
          accessToken: `mobile-from-${portalJwt}`,
          cookieJar: await sessionJar(portalJwt),
        };
      },
    };
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      JSON.stringify({ success: true, resultData: [] }),
      { status: 200 },
    )) as any;

    const request = new MobileYxtSessionExecutor(exchanger).post(user.id, mobileUrl, {});
    await oldStartedPromise;
    await persistSchoolLogin(studentId, 'portal-new');
    releaseOld();
    expect((await request).response.status).toBe(200);

    const epoch = readSchoolLoginEpoch(getDb(), user.id);
    const stored = await sessions.read(user.id);
    const rows = await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, user.id),
      like(schema.credentials.system, 'derived_session:%'),
    ));
    expect(seenPortalTokens).toEqual(['portal-old', 'portal-new']);
    expect(stored).toMatchObject({ accessToken: 'mobile-from-portal-new', loginEpoch: epoch });
    expect(rows).toHaveLength(1);
    expect(rows[0].value).not.toContain('mobile-from-portal-old');
  });

  it('普通 Portal JWT 轮换和本地快捷登录不推进 epoch，也不使仍工作的 mobile 会话失效', async () => {
    const user = await persistSchoolLogin('mobile-portal-rotation', 'portal-v1');
    const epoch = readSchoolLoginEpoch(getDb(), user.id);
    const created = await sessions.createIfLoginEpochMatches({
      userId: user.id,
      expectedLoginEpoch: epoch,
      accessToken: 'mobile-stable',
      cookieJar: await sessionJar(),
    });
    await CredentialManager.storeCredential(user.id, 'portal_jwt', 'portal-v2', null, 60_000);
    await new SqliteIdentityStore().touchLocalLogin(user.id, new Date());
    expect(readSchoolLoginEpoch(getDb(), user.id)).toBe(epoch);
    expect(await sessions.read(user.id)).toEqual(created);
  });

  it('通用 CredentialManager 拒绝非正 TTL 和无 TTL 基础凭证，读取与批量失效不越过模块边界', async () => {
    const user = await persistSchoolLogin('mobile-ttl-boundary', 'portal');
    await expect(CredentialManager.storeCredential(
      user.id,
      'portal_jwt',
      'invalid',
      null,
      null as any,
    )).rejects.toThrow('CREDENTIAL_TTL_MUST_BE_POSITIVE_INTEGER');
    await expect(CredentialManager.storeCredential(
      user.id,
      'portal_jwt',
      'invalid',
      null,
      0,
    )).rejects.toThrow('CREDENTIAL_TTL_MUST_BE_POSITIVE_INTEGER');
    const epoch = readSchoolLoginEpoch(getDb(), user.id);
    await sessions.createIfLoginEpochMatches({
      userId: user.id,
      expectedLoginEpoch: epoch,
      accessToken: 'mobile-no-ttl',
      cookieJar: await sessionJar(),
    });
    await getDb().update(schema.credentials).set({ expiresAt: null }).where(and(
      eq(schema.credentials.userId, user.id),
      eq(schema.credentials.system, 'portal_jwt'),
    ));
    expect(await CredentialManager.getCredential(user.id, 'portal_jwt')).toBeNull();
    await CredentialManager.cleanupExpired();
    await CredentialManager.invalidateAll(user.id);
    expect((await sessions.read(user.id))?.accessToken).toBe('mobile-no-ttl');
  });
});

describe('Cookie 最小权限与认证错误', () => {
  it('带 CAS TGC 和无关 Cookie 的输入 Jar 不会进入 mobile 持久化输出', async () => {
    const inputJar = new CookieJar();
    await inputJar.setCookie('TGC=cas-secret; Domain=cas.huas.edu.cn; Path=/cas; HttpOnly', 'https://cas.huas.edu.cn/cas/login');
    await inputJar.setCookie('PORTAL=portal-secret; Domain=portal.huas.edu.cn; Path=/', 'https://portal.huas.edu.cn/login');
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (!init?.method) {
        return new Response(null, { status: 302, headers: { location: '/next?tid=temporary-tid' } });
      }
      return new Response(JSON.stringify({
        success: true,
        resultData: { accessToken: 'mobile-access', refreshToken: 'do-not-store' },
      }), {
        status: 200,
        headers: { 'Set-Cookie': 'JSESSIONID=mobile-only; Path=/server; HttpOnly' },
      });
    }) as any;

    const result = await new MobileYxtAuthExchanger().exchange(new HttpClient(inputJar), 'portal-jwt');
    const output = CookieJar.fromJSON(result.cookieJar);
    const serialized = JSON.stringify(output.toJSON());
    expect(await output.getCookieString(mobileUrl)).toBe('JSESSIONID=mobile-only');
    expect(serialized).not.toMatch(/TGC|cas-secret|PORTAL|portal-secret|temporary-tid|do-not-store/i);
    expect(output.toJSON().cookies).toHaveLength(1);
  });

  it('认证交换 HTTP 401 返回 3003，403 与未知 success=false 不冒充会话失效', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 401 })) as any;
    await expect(new MobileYxtAuthExchanger().exchange(new HttpClient(), 'portal-jwt'))
      .rejects.toMatchObject({ code: ErrorCode.CREDENTIAL_EXPIRED, kind: 'credential' });
    expect(isMobileYxtSessionExpired({ status: 401 }, null)).toBe(true);
    expect(isMobileYxtSessionExpired({ status: 403 }, { success: false })).toBe(false);
    expect(isMobileYxtSessionExpired({ status: 200 }, { success: false })).toBe(false);
  });

  it('host/open 对过期 Portal JWT 返回 200 HTML 时按凭证拒绝恢复，JSON 200 仍失败关闭', async () => {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      '<!doctype html><html><body>mobile entry</body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8' } },
    )) as any;
    await expect(new MobileYxtAuthExchanger().exchange(new HttpClient(), 'expired-portal-jwt'))
      .rejects.toMatchObject({ code: ErrorCode.CREDENTIAL_EXPIRED, kind: 'credential' });

    fetchSpy.mockRestore();
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      JSON.stringify({ success: true, resultData: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as any;
    await expect(new MobileYxtAuthExchanger().exchange(new HttpClient(), 'unknown-contract'))
      .rejects.toMatchObject({ code: ErrorCode.INTERNAL_ERROR, kind: 'protocol' });
  });

  it('Bun fetch 错误及嵌套 cause 归为可 stale 的上游不可用，不冒充协议漂移', () => {
    const bunConnectionError = Object.assign(
      new Error('Unable to connect. Is the computer able to access the url?'),
      { code: 'ConnectionRefused', errno: 0 },
    );
    const wrappedFetchError = Object.assign(new TypeError('fetch() failed'), {
      cause: Object.assign(new Error('socket closed'), { code: 'ECONNRESET' }),
    });

    expect(normalizeMobileYxtTransportError(bunConnectionError)).toMatchObject({
      kind: 'unavailable',
      code: ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE,
      staleAllowed: true,
    });
    expect(normalizeMobileYxtTransportError(wrappedFetchError)).toMatchObject({
      kind: 'unavailable',
      staleAllowed: true,
    });
    expect(normalizeMobileYxtTransportError(new Error('decoder invariant broken')))
      .toMatchObject({ kind: 'protocol', staleAllowed: false });
  });

  it('业务请求遇到 Bun 连接错误时执行有界重试，而不是立即包装成协议错误', async () => {
    const user = await persistSchoolLogin('mobile-bun-network-retry', 'portal');
    const epoch = readSchoolLoginEpoch(getDb(), user.id);
    await sessions.createIfLoginEpochMatches({
      userId: user.id,
      expectedLoginEpoch: epoch,
      accessToken: 'mobile-network-retry',
      cookieJar: await sessionJar('network-retry'),
    });
    let requestCount = 0;
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => {
      requestCount += 1;
      if (requestCount === 1) {
        throw Object.assign(
          new Error('Unable to connect. Is the computer able to access the url?'),
          { code: 'ConnectionRefused' },
        );
      }
      return new Response(JSON.stringify({ success: true, resultData: [] }), { status: 200 });
    }) as any;

    const result = await new MobileYxtSessionExecutor().post(user.id, mobileUrl, {});
    expect(result.response.status).toBe(200);
    expect(requestCount).toBe(2);
  });

  it('host/open 明确拒绝本地 Portal JWT 后条件失效，并只恢复重试一次', async () => {
    const userId = await createUser('mobile-portal-recovery');
    let currentPortalJwt = 'portal-rejected';
    const seenPortalTokens: string[] = [];
    const portalReader = {
      async readOrRestore() {
        return { portalJwt: currentPortalJwt, loginEpoch: 0 };
      },
      async rejectIfCurrent(_userId: number, portalJwt: string) {
        if (portalJwt === currentPortalJwt) currentPortalJwt = 'portal-restored';
      },
    };
    const exchanger = {
      async exchange(_client: HttpClient, portalJwt: string) {
        seenPortalTokens.push(portalJwt);
        if (portalJwt === 'portal-rejected') throw mobileYxtCredentialRejected();
        return { accessToken: 'mobile-restored', cookieJar: await sessionJar('restored') };
      },
    };
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      JSON.stringify({ success: true, resultData: [] }),
      { status: 200 },
    )) as any;

    const result = await new MobileYxtSessionExecutor(exchanger, sessions, portalReader)
      .post(userId, mobileUrl, {});
    expect(result.response.status).toBe(200);
    expect(seenPortalTokens).toEqual(['portal-rejected', 'portal-restored']);
  });

  it('认证拒绝禁止 stale fallback，超时和可用性故障仍按既有策略回退缓存', async () => {
    const userId = await createUser('mobile-stale-errors');
    const month = currentMonthOffset(0);
    const key = mobileYxtTransactionCacheKey(userId, month);
    await CacheService.set(key, { transactions: [], truncated: false }, 0, 'mobile-yxt');
    const rejectedTrades = { async listMonth() { throw mobileYxtCredentialRejected(); } };
    const timeoutTrades = { async listMonth() { throw mobileYxtTimeout(); } };
    const unavailableTrades = { async listMonth() { throw mobileYxtUnavailable(); } };

    await expect(new ECardOverviewService(portalBalance, rejectedTrades, noQuota)
      .getOverview(userId, 'student', month, true))
      .rejects.toMatchObject({ code: ErrorCode.CREDENTIAL_EXPIRED });
    const fallback = await new ECardOverviewService(portalBalance, timeoutTrades, noQuota)
      .getOverview(userId, 'student', month, true);
    expect(fallback.transactions).toEqual([]);
    expect(fallback.partial).toBe(false);
    expect(fallback.degraded).toBe(true);
    expect(fallback.staleParts).toEqual(['transactions']);
    expect(fallback.freshness.transactions).toMatchObject({
      cached: true,
      stale: true,
      refresh_failed: true,
    });
    expect((await new ECardOverviewService(portalBalance, unavailableTrades, noQuota)
      .getOverview(userId, 'student', month, true)).transactions).toEqual([]);
  });
});

describe('401 generation 并发语义', () => {
  it('重建后的第二次 401 条件删除对应 generation，并返回 3003', async () => {
    const user = await persistSchoolLogin('mobile-second-401', 'portal');
    const epoch = readSchoolLoginEpoch(getDb(), user.id);
    await sessions.createIfLoginEpochMatches({
      userId: user.id,
      expectedLoginEpoch: epoch,
      accessToken: 'old-mobile',
      cookieJar: await sessionJar('old'),
    });
    const exchanger = { async exchange() {
      return { accessToken: 'rebuilt-mobile', cookieJar: await sessionJar('rebuilt') };
    } };
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      JSON.stringify({ success: false }),
      { status: 401 },
    )) as any;

    await expect(new MobileYxtSessionExecutor(exchanger).post(user.id, mobileUrl, {}))
      .rejects.toMatchObject({ code: ErrorCode.CREDENTIAL_EXPIRED });
    expect(await sessions.read(user.id)).toBeNull();
    const derivedRows = await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, user.id),
      like(schema.credentials.system, 'derived_session:%'),
    ));
    expect(derivedRows).toHaveLength(0);
  });

  it('并发迟到 401 不能删除已经创建的新 generation', async () => {
    const user = await persistSchoolLogin('mobile-late-401', 'portal');
    const epoch = readSchoolLoginEpoch(getDb(), user.id);
    const old = await sessions.createIfLoginEpochMatches({
      userId: user.id,
      expectedLoginEpoch: epoch,
      accessToken: 'old-mobile',
      cookieJar: await sessionJar('old'),
    });
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const token = new Headers(init?.headers).get('authorization');
      if (token === 'old-mobile') {
        started();
        await releasePromise;
        return new Response('{}', { status: 401 });
      }
      return new Response(JSON.stringify({ success: true, resultData: [] }), { status: 200 });
    }) as any;
    const request = new MobileYxtSessionExecutor().post(user.id, mobileUrl, {});
    await startedPromise;
    expect(await sessions.invalidateGeneration(user.id, old!.generation)).toBe(true);
    const fresh = await sessions.createIfLoginEpochMatches({
      userId: user.id,
      expectedLoginEpoch: epoch,
      accessToken: 'new-mobile',
      cookieJar: await sessionJar('new'),
    });
    release();
    expect((await request).response.status).toBe(200);
    expect(await sessions.read(user.id)).toEqual(fresh);
  });
});

describe('月份、严格解析与缓存放大边界', () => {
  it('只允许当前月和此前 23 个自然月，缓存键长度固定', () => {
    const now = new Date('2026-08-23T12:00:00+08:00');
    expect(resolveBeijingMonth('2026-08', now).toDate).toBe('2026-08-31');
    expect(resolveBeijingMonth('2024-09', now).fromDate).toBe('2024-09-01');
    expect(() => resolveBeijingMonth('2024-08', now)).toThrow(`此前 ${MOBILE_YXT_QUERY_MONTHS - 1} 个自然月`);
    expect(() => resolveBeijingMonth('2026-09', now)).toThrow('month 仅允许');
    expect(() => resolveBeijingMonth('2026-8', now)).toThrow('YYYY-MM');
    expect(mobileYxtTransactionCacheKey(1, '2026-08').length)
      .toBe(mobileYxtTransactionCacheKey(Number.MAX_SAFE_INTEGER, '2026-08').length);
  });

  it('未知 resultData 与缺字段交易失败关闭且不写缓存，合法空态返回空数组', async () => {
    expect(() => parseTradePage({ success: true, resultData: { unknown: [] } }, 'consumption', 0))
      .toThrow('mobile-yxt 上游响应协议无法识别');
    expect(() => parseTradePage({
      success: true,
      resultData: { records: [{ summary: '缺字段' }] },
    }, 'consumption', 0)).toThrow('mobile-yxt 上游响应协议无法识别');
    expect(parseTradePage({ success: true, resultData: [] }, 'consumption', 0).transactions).toEqual([]);
    expect(parseTradePage({ success: true, resultData: { records: [], totalPages: 0 } }, 'consumption', 0).transactions)
      .toEqual([]);

    const userId = await createUser('mobile-protocol-cache');
    const month = currentMonthOffset(0);
    const invalidTrades = { async listMonth() { throw mobileYxtProtocolFailure(); } };
    await expect(new ECardOverviewService(portalBalance, invalidTrades, noQuota)
      .getOverview(userId, 'student', month))
      .rejects.toMatchObject({ kind: 'protocol' });
    expect(await CacheService.get(mobileYxtTransactionCacheKey(userId, month))).toBeNull();
  });

  it('refundFlag 保留原始字段，totals 只做原始有符号金额汇总', () => {
    const page = parseTradePage({
      success: true,
      resultData: { records: [{
        summary: '退款语义未验证',
        merchantName: '测试商户',
        date: '2026-08-01 10:20:30',
        amt: '-1.23',
        isRefund: '1',
      }], totalPages: 1 },
    }, 'consumption', 0);
    expect(page.transactions[0].refundFlag).toBe('1');
    expect(summarizeTransactions(page.transactions).consumptionCents).toBe(-123);
  });

  it('同键缓存 miss 与 refresh 共享一条电费回源，避免完成顺序覆盖', async () => {
    const userId = await createUser('mobile-electric-flight-merge');
    let release!: () => void;
    let started!: () => void;
    let calls = 0;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    const account = {
      roomDisplayName: '测试房间',
      cardBalanceCents: 100,
      priceCentsPerKwh: 62,
      remainingKwh: '1.00',
      accountStatus: '正常',
      detailsAvailable: false as const,
      officialPaymentAvailable: false as const,
    };
    const service = new ElectricityService({
      async getAccount() {
        calls += 1;
        started();
        await releasePromise;
        return account;
      },
    }, noQuota);

    const miss = service.getAccount(userId, 'student', false);
    await startedPromise;
    const refresh = service.getAccount(userId, 'student', true);
    release();
    expect((await miss).data).toEqual(account);
    expect((await refresh).data).toEqual(account);
    expect(calls).toBe(1);
  });

  it('无 refresh 的随机月份 cache miss 同样限流', async () => {
    const userId = await createUser('mobile-miss-limit');
    const service = new ECardOverviewService(portalBalance, emptyTrades);
    for (let offset = 0; offset < MOBILE_YXT_READ_MAX_REQUESTS; offset += 1) {
      expect((await service.getOverview(userId, 'student', currentMonthOffset(offset))).partial).toBe(false);
    }
    await expect(service.getOverview(userId, 'student', currentMonthOffset(MOBILE_YXT_READ_MAX_REQUESTS)))
      .rejects.toMatchObject({ code: ErrorCode.TOO_MANY_REQUESTS });
    const rows = await getDb().select().from(schema.cache).where(like(
      schema.cache.key,
      `${mobileYxtTransactionCachePrefix(userId)}%`,
    ));
    expect(rows).toHaveLength(MOBILE_YXT_READ_MAX_REQUESTS);
  });

  it('随机月份轰炸后每用户只保留硬上限缓存条目，三类分页仍各自最多 20 页', async () => {
    const userId = await createUser('mobile-cache-lru');
    const service = new ECardOverviewService(portalBalance, emptyTrades, noQuota);
    const offsets = Array.from({ length: MOBILE_YXT_QUERY_MONTHS }, (_, index) => index)
      .sort((left, right) => ((left * 17) % 23) - ((right * 17) % 23));
    for (const offset of offsets) await service.getOverview(userId, 'student', currentMonthOffset(offset));
    const rows = await getDb().select().from(schema.cache).where(like(
      schema.cache.key,
      `${mobileYxtTransactionCachePrefix(userId)}%`,
    ));
    expect(rows).toHaveLength(MOBILE_YXT_TRANSACTION_CACHE_LIMIT);
    expect(new Set(rows.map((row) => row.key.length)).size).toBe(1);

    const payloads: unknown[] = [];
    const tradeClient = new MobileYxtTradeClient({
      async post(_userId, _url, payload) {
        payloads.push(payload);
        return {
          response: new Response(null, { status: 200 }),
          body: {
            success: true,
            resultData: Array.from({ length: 30 }, (_, index) => ({
              summary: `交易-${index}`,
              merchantName: '测试商户',
              date: '2026-08-01 00:00:00',
              amt: '-0.01',
              isRefund: false,
            })),
          },
        };
      },
    } as any);
    expect((await tradeClient.listMonth(userId, 'consumption', '2026-08-01', '2026-08-31')).truncated).toBe(true);
    expect(payloads).toHaveLength(MAX_TRADE_PAGES);
  });
});

describe('mobile-yxt 真实电费响应合同', () => {
  it('从 config.location 和无序 template code 映射稳定 DTO，并忽略未知 code', () => {
    const account = electricityAccount([
      { code: 'quantity', name: '剩余电量', unit: '度', show: true, value: '-11.10' },
      { code: 'future_metric', name: '未来字段', unit: '', show: false, value: 'ignored' },
      { code: 'balance', name: '电费余额', unit: '元', show: true, value: '-6.88' },
      { code: 'price', name: '电价', unit: '元/度', show: true, value: '0.62' },
      { code: 'ykt_balance', name: '校园卡余额', unit: '元', show: true, value: '12.34' },
    ]);
    expect(parseElectricityFixture(electricityConfig(), account)).toEqual({
      roomDisplayName: '西校区 九舍 418',
      cardBalanceCents: 1234,
      priceCentsPerKwh: 62,
      remainingKwh: '-11.10',
      accountStatus: '正常',
      detailsAvailable: false,
      officialPaymentAvailable: false,
    });
  });

  it('price/quantity 的真实 null 表示上游未提供，仍返回成功 DTO', () => {
    const account = electricityAccount([
      { code: 'quantity', name: '剩余电量', unit: '度', show: true, value: null },
      { code: 'price', name: '电价', unit: '元/度', show: true, value: null },
      { code: 'ykt_balance', name: '校园卡余额', unit: '元', show: true, value: '12.34' },
    ]);
    expect(parseElectricityFixture(electricityConfig(), account)).toMatchObject({
      priceCentsPerKwh: null,
      remainingKwh: null,
    });
  });

  it('位置完全缺失、非法金额与余额来源冲突按具体 stage 失败关闭', () => {
    expect(() => parseElectricityFixture(electricityConfig(null), electricityAccount()))
      .toThrow(expect.objectContaining({
        operation: 'ELECTRICITY_CONFIG',
        stage: 'config_location_invalid',
      }));

    const invalidPrice = electricityAccount([
      { code: 'price', name: '电价', unit: '元/度', show: true, value: 'free' },
      { code: 'quantity', name: '剩余电量', unit: '度', show: true, value: '1.00' },
    ]);
    expect(() => parseElectricityFixture(electricityConfig(), invalidPrice))
      .toThrow(expect.objectContaining({
        operation: 'ELECTRICITY_PRICE',
        stage: 'numeric_format_invalid',
      }));

    const conflictingBalance = electricityAccount([
      { code: 'ykt_balance', name: '校园卡余额', unit: '元', show: true, value: '99.99' },
      { code: 'price', name: '电价', unit: '元/度', show: true, value: '0.62' },
      { code: 'quantity', name: '剩余电量', unit: '度', show: true, value: '1.00' },
    ]);
    expect(() => parseElectricityFixture(electricityConfig(), conflictingBalance))
      .toThrow(expect.objectContaining({ stage: 'contract_drift' }));
  });

  it('success=false 保持业务失败，不冒充协议或凭证失效', () => {
    expect(() => parseElectricityFixture(
      { success: false, resultData: null },
      electricityAccount(),
    )).toThrow(expect.objectContaining({
      kind: 'business',
      operation: 'ELECTRICITY_CONFIG',
      stage: 'business_rejected',
    }));
  });

  it('HTTP 200 协议错误保留派生会话，并只记录低敏感结构元数据', async () => {
    const user = await persistSchoolLogin('mobile-electric-protocol', 'portal');
    const epoch = readSchoolLoginEpoch(getDb(), user.id);
    const stored = await sessions.createIfLoginEpochMatches({
      userId: user.id,
      expectedLoginEpoch: epoch,
      accessToken: 'mobile-stable',
      cookieJar: await sessionJar(),
    });
    let requestCount = 0;
    let accountPayload: unknown = null;
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      requestCount += 1;
      if (String(input).endsWith('/account')) accountPayload = JSON.parse(String(init?.body));
      const body = String(input).endsWith('/config')
        ? electricityConfig()
        : { success: true, resultData: { balance: '12.34', accStatusName: '正常' } };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;
    const warnSpy = spyOn(Logger, 'warn').mockImplementation(() => {});
    try {
      await expect(new MobileYxtElectricityClient().getAccount(user.id))
        .rejects.toMatchObject({ kind: 'protocol', stage: 'template_list_invalid' });
      expect(requestCount).toBe(2);
      expect(accountPayload).toEqual({
        utilityType: 'electric',
        bigArea: '',
        area: '102',
        building: '16',
        unit: '',
        level: '104',
        room: '102-16--104-418',
        subArea: '',
      });
      expect(await sessions.read(user.id)).toEqual(stored);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const detail = String(warnSpy.mock.calls[0][2]);
      expect(detail).toContain('operation=ELECTRICITY_ACCOUNT');
      expect(detail).toContain('stage=template_list_invalid');
      expect(detail).toContain('status=200');
      expect(detail).toContain('contentType=application/json');
      expect(detail).toContain('topLevelKeys=resultData,success');
      expect(detail).not.toMatch(/mobile-stable|JSESSIONID|authorization|utilityAccount/i);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('协议失败既不写新缓存，也不以 stale 缓存掩盖', async () => {
    const userId = await createUser('mobile-electric-cache-failure');
    const cacheKey = mobileYxtElectricityCacheKey(userId);
    const stale = {
      roomDisplayName: '旧房间',
      cardBalanceCents: 1,
      priceCentsPerKwh: 1,
      remainingKwh: '1.00',
      accountStatus: '旧状态',
      detailsAvailable: false as const,
      officialPaymentAvailable: false as const,
    };
    await CacheService.set(cacheKey, stale, 0, 'mobile-yxt');
    const reader = { async getAccount() {
      throw mobileYxtProtocolFailure('ELECTRICITY_ACCOUNT', 'account_invalid');
    } };
    await expect(new ElectricityService(reader, noQuota).getAccount(userId, 'student', true))
      .rejects.toMatchObject({ kind: 'protocol', stage: 'account_invalid' });
    expect((await CacheService.get(cacheKey))?.data).toEqual(stale);
  });
});

describe('跨服务隔离与 HTTP 兼容', () => {
  it('mobile 强刷配额与成绩/课表 Academic refresh 桶双向互不消耗', async () => {
    const academicProbe = new Hono();
    academicProbe.use('*', async (c, next) => { c.set('userId', 42); await next(); });
    academicProbe.use('*', academicRefreshRateLimitMiddleware);
    academicProbe.get('/probe', (c) => c.json({ ok: true }));

    const mobileService = new ECardOverviewService(portalBalance, emptyTrades);
    for (let index = 0; index < MOBILE_YXT_READ_MAX_REQUESTS; index += 1) {
      await mobileService.getOverview(42, 'student', currentMonthOffset(0), true);
    }
    await expect(mobileService.getOverview(42, 'student', currentMonthOffset(0), true))
      .rejects.toMatchObject({ code: ErrorCode.TOO_MANY_REQUESTS });
    for (let index = 0; index < 5; index += 1) {
      expect((await academicProbe.request('http://localhost/probe?refresh=true')).status).toBe(200);
    }
    expect((await academicProbe.request('http://localhost/probe?refresh=true')).status).toBe(429);

    resetAcademicRefreshRateLimitStateForTests();
    resetMobileYxtReadRateLimitStateForTests();
    for (let index = 0; index < 5; index += 1) {
      expect((await academicProbe.request('http://localhost/probe?refresh=true')).status).toBe(200);
    }
    for (let index = 0; index < MOBILE_YXT_READ_MAX_REQUESTS; index += 1) {
      await mobileService.getOverview(42, 'student', currentMonthOffset(0), true);
    }
    await expect(mobileService.getOverview(42, 'student', currentMonthOffset(0), true))
      .rejects.toThrow('mobile-yxt 只读请求过于频繁');
  });

  it('overview/electricity 路由不经过已耗尽的 Academic refresh 桶', async () => {
    const studentId = 'mobile-route-limit-isolation';
    const userId = await createUser(studentId);
    const academicProbe = new Hono();
    academicProbe.use('*', async (c, next) => { c.set('userId', userId); await next(); });
    academicProbe.use('*', academicRefreshRateLimitMiddleware);
    academicProbe.get('/probe', (c) => c.json({ ok: true }));
    for (let index = 0; index < 5; index += 1) {
      await academicProbe.request('http://localhost/probe?refresh=true');
    }
    expect((await academicProbe.request('http://localhost/probe?refresh=true')).status).toBe(429);

    await CacheService.set(`ecard:${studentId}`, { balance: 1, status: '正常', lastTime: '' }, 0, 'portal');
    await CacheService.set(mobileYxtTransactionCacheKey(userId, currentMonthOffset(0)), {
      transactions: [], truncated: false,
    }, 0, 'mobile-yxt');
    await CacheService.set(mobileYxtElectricityCacheKey(userId), {
      roomDisplayName: '测试房间', cardBalanceCents: 0, priceCentsPerKwh: 62,
      remainingKwh: '1.00', accountStatus: '正常', detailsAvailable: false,
      officialPaymentAvailable: false,
    }, 0, 'mobile-yxt');
    const app = new Hono();
    registerRoutes(app);
    const headers = { Authorization: `Bearer ${await generateToken({ userId, studentId })}` };
    expect((await app.request(
      `http://localhost/api/ecard/overview?month=${currentMonthOffset(0)}`,
      { headers },
    )).status).toBe(200);
    expect((await app.request('http://localhost/api/utilities/electricity', { headers })).status).toBe(200);
  });

  it('mobile 请求不创建、更新或删除 JW Session；缺 Portal 稳定返回 3003', async () => {
    const user = await persistSchoolLogin('mobile-jw-isolation', 'portal', '{"cookies":[{"key":"JW","value":"stable"}]}');
    const before = await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, user.id),
      eq(schema.credentials.system, 'jw_session'),
    )).limit(1);
    const epoch = readSchoolLoginEpoch(getDb(), user.id);
    await sessions.createIfLoginEpochMatches({
      userId: user.id,
      expectedLoginEpoch: epoch,
      accessToken: 'mobile-valid',
      cookieJar: await sessionJar(),
    });
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      JSON.stringify({ success: true, resultData: [] }),
      { status: 200 },
    )) as any;
    expect((await new MobileYxtSessionExecutor().post(user.id, mobileUrl, {})).response.status).toBe(200);
    const after = await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, user.id),
      eq(schema.credentials.system, 'jw_session'),
    )).limit(1);
    expect(after).toEqual(before);

    const missingPortalUser = await createUser('mobile-no-portal');
    await CredentialManager.storeCredential(missingPortalUser, 'jw_session', null, '{"cookies":[]}', 60_000);
    const missingBefore = await CredentialManager.getCredential(missingPortalUser, 'jw_session');
    await expect(new MobileYxtSessionExecutor().post(missingPortalUser, mobileUrl, {}))
      .rejects.toMatchObject({ code: ErrorCode.CREDENTIAL_EXPIRED });
    expect(await CredentialManager.getCredential(missingPortalUser, 'jw_session')).toEqual(missingBefore);
  });

  it('旧 GET /api/ecard 响应合同完全不变', async () => {
    const studentId = 'mobile-legacy-http';
    const userId = await createUser(studentId);
    await CacheService.set(`ecard:${studentId}`, {
      balance: 12.34,
      status: '正常',
      lastTime: 'legacy-time',
    }, 0, 'portal');
    await CacheService.set(mobileYxtTransactionCacheKey(userId, currentMonthOffset(0)), {
      transactions: [],
      truncated: false,
    }, 0, 'mobile-yxt');
    await CacheService.set(mobileYxtElectricityCacheKey(userId), {
      roomDisplayName: '测试房间',
      cardBalanceCents: 0,
      priceCentsPerKwh: 62,
      remainingKwh: '-11.10',
      accountStatus: '正常',
      detailsAvailable: false,
      officialPaymentAvailable: false,
    }, 0, 'mobile-yxt');
    const app = new Hono();
    registerRoutes(app);
    const headers = { Authorization: `Bearer ${await generateToken({ userId, studentId })}` };
    const response = await app.request('http://localhost/api/ecard', { headers });
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(Object.keys(body).sort()).toEqual(['_meta', 'data', 'success']);
    expect(body.data).toEqual({ balance: 12.34, status: '正常', lastTime: 'legacy-time' });
    expect(body._meta).toMatchObject({ cached: true, source: 'portal' });
  });

  it('只存在已批准只读上游路径，不含 pay/usageDetails/water/books/handoff', () => {
    const mobileEntries = Object.entries(URLS).filter(([key]) => key.startsWith('mobileYxt'));
    expect(mobileEntries.map(([key]) => key).sort()).toEqual([
      'mobileYxtElectricityAccount',
      'mobileYxtElectricityConfig',
      'mobileYxtGetToken',
      'mobileYxtHostOpen',
      'mobileYxtTradeList',
    ]);
    expect(JSON.stringify(mobileEntries)).not.toMatch(/pay|usageDetails|water|books|handoff/i);
  });

});
