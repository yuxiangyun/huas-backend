/**
 * [INPUT]: 依赖隔离 SQLite、真实 SchoolAccess 交易/电费读取、业务缓存服务与 Bearer 子路由
 * [OUTPUT]: 锁定 24 月/6 条 LRU、分页上限、有符号 totals、同键合流、电费 nullable/协议诊断、独立配额及旧余额 HTTP 合同
 * [POS]: tests 的 mobile-yxt 业务投影套件；认证恢复竞态由 mobile-yxt-session.test.ts 独立覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { and, eq, like } from 'drizzle-orm';
import { Hono } from 'hono';
import { generateToken } from '../src/auth/jwt';
import { getDb, schema } from '../src/db';
import {
  academicRefreshRateLimitMiddleware,
  resetAcademicRefreshRateLimitStateForTests,
} from '../src/middleware/academic-refresh-rate-limit.middleware';
import { CacheService } from '../src/modules/cache/cache-service';
import { URLS } from '../src/modules/campus-integrations/endpoints';
import {
  ECardOverviewService,
  MOBILE_YXT_TRANSACTION_CACHE_LIMIT,
  mobileYxtTransactionCacheKey,
  mobileYxtTransactionCachePrefix,
} from '../src/modules/campus-integrations/mobile-yxt/ecard-overview-service';
import { MobileYxtElectricityClient } from '../src/modules/campus-integrations/mobile-yxt/electricity-client';
import { ElectricityService, mobileYxtElectricityCacheKey } from '../src/modules/campus-integrations/mobile-yxt/electricity-service';
import { mobileYxtProtocolFailure } from '../src/modules/campus-integrations/mobile-yxt/mobile-yxt-errors';
import {
  MOBILE_YXT_READ_MAX_REQUESTS,
  resetMobileYxtReadRateLimitStateForTests,
} from '../src/modules/campus-integrations/mobile-yxt/read-rate-limiter';
import { SqliteMobileYxtSessionRepository } from '../src/modules/campus-integrations/mobile-yxt/session-repository';
import { MAX_TRADE_PAGES, MobileYxtTradeClient } from '../src/modules/campus-integrations/mobile-yxt/trade-client';
import {
  MOBILE_YXT_QUERY_MONTHS,
  parseTradePage,
  resolveBeijingMonth,
  summarizeTransactions,
} from '../src/modules/campus-integrations/mobile-yxt/trade-parser';
import { readSchoolLoginEpoch } from '../src/modules/campus-integrations/school-access/school-login-context';
import { schoolStateStore } from '../src/modules/campus-integrations/school-access/state-store';
import { registerRoutes } from '../src/routes';
import { ErrorCode } from '../src/utils/errors';
import { Logger } from '../src/utils/logger';
import { mockFetch, readTrades, restoreMobileSpies, seedCredential } from './mobile-school-fixtures';

import {
  createUser,
  currentMonthOffset,
  electricityAccount,
  electricityConfig,
  emptyTrades,
  noQuota,
  parseElectricityFixture,
  persistSchoolLogin,
  portalBalance,
  sessionJar,
} from './mobile-yxt-fixtures';

let fetchSpy: ReturnType<typeof spyOn> | null = null;
const sessions = new SqliteMobileYxtSessionRepository();

async function resetDatabase() {
  await getDb().delete(schema.credentials);
  await getDb().delete(schema.cache);
  resetAcademicRefreshRateLimitStateForTests();
  resetMobileYxtReadRateLimitStateForTests();
}

function registerCampusRoutes(app: Hono) {
  registerRoutes(app, {
    adminRoutes: new Hono(), communityRoutes: new Hono(), discoverRoutes: new Hono(),
    earlyRisingRoutes: new Hono(), messagingRoutes: new Hono(), notificationRoutes: new Hono(),
    socialSummaryRoutes: new Hono(), treeholeRoutes: new Hono(),
  });
}

beforeEach(resetDatabase);
afterEach(() => {
  restoreMobileSpies();
  fetchSpy?.mockRestore();
  fetchSpy = null;
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
    await sessions.createIfLoginEpochMatches({ userId, expectedLoginEpoch: 0,
      accessToken: 'pagination', cookieJar: await sessionJar() });
    fetchSpy = mockFetch(async (_input, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      return Response.json({ success: true, resultData: Array.from({ length: 30 }, (_, index) => ({
        summary: `交易-${index}`, merchantName: '测试商户', date: '2026-08-01 00:00:00', amt: '-0.01', isRefund: false,
      })) });
    });
    const tradeClient = new MobileYxtTradeClient();
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
    fetchSpy = mockFetch(async (input, init) => {
      requestCount += 1;
      if (String(input).endsWith('/account')) accountPayload = JSON.parse(String(init?.body));
      const body = String(input).endsWith('/config')
        ? electricityConfig()
        : { success: true, resultData: { balance: '12.34', accStatusName: '正常' } };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
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
    registerCampusRoutes(app);
    const headers = { Authorization: `Bearer ${await generateToken({ userId, studentId })}` };
    expect((await app.request(
      `http://localhost/api/ecard/overview?month=${currentMonthOffset(0)}`,
      { headers },
    )).status).toBe(200);
    expect((await app.request('http://localhost/api/utilities/electricity', { headers })).status).toBe(200);
  });

  it('mobile 请求不创建、更新或删除 JW Session；缺 Portal 稳定返回 3005', async () => {
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
    fetchSpy = mockFetch(async () => new Response(
      JSON.stringify({ success: true, resultData: [] }),
      { status: 200 },
    ));
    expect((await readTrades(user.id)).status).toBe(200);
    const after = await getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, user.id),
      eq(schema.credentials.system, 'jw_session'),
    )).limit(1);
    expect(after).toEqual(before);

    const missingPortalUser = await createUser('mobile-no-portal');
    await seedCredential(missingPortalUser, 'jw_session', null, '{"cookies":[]}');
    const missingBefore = await schoolStateStore.read(missingPortalUser, 'jw_session');
    await expect(readTrades(missingPortalUser))
      .rejects.toMatchObject({ code: ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, kind: 'credential', staleAllowed: false });
    expect(await schoolStateStore.read(missingPortalUser, 'jw_session')).toEqual(missingBefore);
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
    registerCampusRoutes(app);
    const headers = { Authorization: `Bearer ${await generateToken({ userId, studentId })}` };
    const response = await app.request('http://localhost/api/ecard', { headers });
    expect(response.status).toBe(200);
    const body = await response.json();
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
