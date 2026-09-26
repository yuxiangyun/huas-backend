/**
 * [INPUT]: 依赖隔离 SQLite、真实 SchoolAccess/SchoolRecovery、单次交换 spy 与可控网络
 * [OUTPUT]: 锁定 epoch/generation/父快照竞态、Portal 窄恢复、二次拒绝 3005、明确交互 3003 及 stale 资格
 * [POS]: tests 的 mobile-yxt 会话恢复套件，阻塞请求在退出前释放并收尾，业务缓存/电费合同另由 mobile-yxt.test.ts 覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { and, eq, like } from 'drizzle-orm';
import { CookieJar } from 'tough-cookie';
import { getDb, schema } from '../src/db';
import { resetAcademicRefreshRateLimitStateForTests } from '../src/middleware/academic-refresh-rate-limit.middleware';
import { CacheService } from '../src/modules/cache/cache-service';
import { TicketExchanger } from '../src/modules/campus-integrations/cas/ticket-exchanger';
import { URLS } from '../src/modules/campus-integrations/endpoints';
import { MobileYxtAuthExchanger, type MobileYxtSessionExchangePort } from '../src/modules/campus-integrations/mobile-yxt/auth-exchanger';
import { ECardOverviewService, mobileYxtTransactionCacheKey } from '../src/modules/campus-integrations/mobile-yxt/ecard-overview-service';
import {
  mobileYxtCredentialRejected,
  mobileYxtTimeout,
  mobileYxtUnavailable,
} from '../src/modules/campus-integrations/mobile-yxt/mobile-yxt-errors';
import { resetMobileYxtReadRateLimitStateForTests } from '../src/modules/campus-integrations/mobile-yxt/read-rate-limiter';
import { SqliteMobileYxtSessionRepository } from '../src/modules/campus-integrations/mobile-yxt/session-repository';
import { MobileYxtTradeClient } from '../src/modules/campus-integrations/mobile-yxt/trade-client';
import { normalizeSchoolFailure } from '../src/modules/campus-integrations/school-access/errors';
import { readSchoolLoginEpoch } from '../src/modules/campus-integrations/school-access/school-login-context';
import { schoolStateStore } from '../src/modules/campus-integrations/school-access/state-store';
import { SqliteIdentityStore } from '../src/modules/identity/infrastructure/sqlite-identity.store';
import { ErrorCode } from '../src/utils/errors';
import { commitLogin, installYxtExchange, mockFetch, readTrades, restoreMobileSpies, seedCredential } from './mobile-school-fixtures';

import { createUser, currentMonthOffset, noQuota, persistSchoolLogin, portalBalance, sessionJar } from './mobile-yxt-fixtures';

let fetchSpy: ReturnType<typeof spyOn> | null = null;
const sessions = new SqliteMobileYxtSessionRepository();
const mobileUrl = URLS.mobileYxtTradeList;

async function resetDatabase() {
  await getDb().delete(schema.credentials);
  await getDb().delete(schema.cache);
  resetAcademicRefreshRateLimitStateForTests();
  resetMobileYxtReadRateLimitStateForTests();
}

beforeEach(resetDatabase);
afterEach(() => {
  restoreMobileSpies();
  fetchSpy?.mockRestore();
  fetchSpy = null;
});

describe('学校登录 epoch 与模块会话仓储', () => {
  it('新学校登录没有取得 Portal JWT 时删除旧值，禁止旧 token 进入新 epoch', async () => {
    const studentId = 'mobile-no-inherited-portal';
    const first = await persistSchoolLogin(studentId, 'portal-old');
    const firstEpoch = readSchoolLoginEpoch(getDb(), first.id);

    commitLogin({ studentId, encryptedPassword: 'new-encrypted-password',
      casCookieJar: '{"cookies":[]}', portalToken: null });

    expect(readSchoolLoginEpoch(getDb(), first.id)).toBe(firstEpoch + 1);
    expect(await schoolStateStore.read(first.id, 'portal_jwt')).toBeNull();
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
      async exchange(portalJwt) {
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
    fetchSpy = mockFetch(async () => new Response(
      JSON.stringify({ success: true, resultData: [] }),
      { status: 200 },
    ));

    installYxtExchange(exchanger);
    const request = readTrades(user.id);
    const settled = Promise.allSettled([request]);
    try {
      await Promise.race([oldStartedPromise, request.then(() => {
        throw new Error('请求未进入预期阻塞点便已完成');
      })]);
      await persistSchoolLogin(studentId, 'portal-new');
      releaseOld();
      expect((await request).status).toBe(200);

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
    } finally {
      releaseOld();
      await settled;
    }
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
    await seedCredential(user.id, 'portal_jwt', 'portal-v2', null);
    await new SqliteIdentityStore().touchLocalLogin(user.id, new Date());
    expect(readSchoolLoginEpoch(getDb(), user.id)).toBe(epoch);
    expect(await sessions.read(user.id)).toEqual(created);
  });

  it('基础凭证保持正数 TTL；无 TTL 坏行不能作为基础凭证且不影响派生会话', async () => {
    const user = await persistSchoolLogin('mobile-ttl-boundary', 'portal');
    const stored = schoolStateStore.read(user.id, 'portal_jwt')!;
    expect(stored.expiresAt).toBeGreaterThan(stored.updatedAt);
    await sessions.createIfLoginEpochMatches({ userId: user.id,
      expectedLoginEpoch: readSchoolLoginEpoch(getDb(), user.id),
      accessToken: 'mobile-no-ttl', cookieJar: await sessionJar() });
    await getDb().update(schema.credentials).set({ expiresAt: null }).where(and(
      eq(schema.credentials.userId, user.id), eq(schema.credentials.system, 'portal_jwt')));
    expect(schoolStateStore.read(user.id, 'portal_jwt')).toBeNull();
    schoolStateStore.cleanupExpired();
    schoolStateStore.markInteraction(user.id, stored.epoch, 'captcha_required');
    expect((await sessions.read(user.id))?.accessToken).toBe('mobile-no-ttl');
  });

});

describe('Cookie 最小权限与认证错误', () => {
  it('交换从独立空 Jar 开始，持久化只保留 mobile Cookie', async () => {
    fetchSpy = mockFetch(async (_input, init) => {
      expect(new Headers(init?.headers).get('cookie') || '').not.toMatch(/TGC|PORTAL/);
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
    });

    const result = await new MobileYxtAuthExchanger().exchange('portal-jwt', Date.now() + 10_000);
    const output = CookieJar.fromJSON(result.cookieJar);
    const serialized = JSON.stringify(output.toJSON());
    expect(await output.getCookieString(mobileUrl)).toBe('JSESSIONID=mobile-only');
    expect(serialized).not.toMatch(/TGC|cas-secret|PORTAL|portal-secret|temporary-tid|do-not-store/i);
    expect(output.toJSON()!.cookies).toHaveLength(1);
  });

  it('认证交换 HTTP 401 返回 3005，403 与未知 success=false 不冒充会话失效', async () => {
    fetchSpy = mockFetch(async () => new Response(null, { status: 401 }));
    await expect(new MobileYxtAuthExchanger().exchange('portal-jwt', Date.now() + 10_000))
      .rejects.toMatchObject({ code: ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, kind: 'credential', staleAllowed: false });
    const user = await persistSchoolLogin('mobile-not-auth-rejected', 'portal');
    const stored = await sessions.createIfLoginEpochMatches({ userId: user.id,
      expectedLoginEpoch: schoolStateStore.epoch(user.id), accessToken: 'valid', cookieJar: await sessionJar() });
    fetchSpy.mockRestore();
    fetchSpy = mockFetch(async () => Response.json({ success: false }, { status: 403 }));
    await expect(readTrades(user.id)).rejects.toMatchObject({ kind: 'business' });
    fetchSpy.mockRestore();
    fetchSpy = mockFetch(async () => Response.json({ success: false }));
    await expect(new MobileYxtTradeClient().listMonth(user.id, 'consumption', '2026-08-01', '2026-08-31')).rejects.toMatchObject({ kind: 'business' });
    expect(await sessions.read(user.id)).toEqual(stored);
  });

  it('host/open 对过期 Portal JWT 返回 200 HTML 时按凭证拒绝恢复，JSON 200 仍失败关闭', async () => {
    fetchSpy = mockFetch(async () => new Response(
      '<!doctype html><html><body>mobile entry</body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8' } },
    ));
    await expect(new MobileYxtAuthExchanger().exchange('expired-portal-jwt', Date.now() + 10_000))
      .rejects.toMatchObject({ code: ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, kind: 'credential', staleAllowed: false });

    fetchSpy.mockRestore();
    fetchSpy = mockFetch(async () => new Response(
      JSON.stringify({ success: true, resultData: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    await expect(new MobileYxtAuthExchanger().exchange('unknown-contract', Date.now() + 10_000))
      .rejects.toMatchObject({ code: ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, kind: 'protocol' });
  });

  it('Bun/Node 嵌套网络错误由统一执行器归一化，未知异常不泄露原文', () => {
    for (const error of [Object.assign(new Error('connect failed'), { code: 'ConnectionRefused' }),
      new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })]) {
      expect(normalizeSchoolFailure(error)).toMatchObject({ kind: 'unavailable', retryable: true });
    }
    expect(normalizeSchoolFailure(new Error('decoder secret'))).toMatchObject({ kind: 'protocol', retryable: false });
    expect(normalizeSchoolFailure(new Error('decoder secret')).message).not.toContain('decoder secret');
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
    fetchSpy = mockFetch(async () => {
      requestCount += 1;
      if (requestCount === 1) {
        throw Object.assign(
          new Error('Unable to connect. Is the computer able to access the url?'),
          { code: 'ConnectionRefused' },
        );
      }
      return new Response(JSON.stringify({ success: true, resultData: [] }), { status: 200 });
    });

    const result = await readTrades(user.id);
    expect(result.status).toBe(200);
    expect(requestCount).toBe(2);
  });

  it('host/open 明确拒绝本地 Portal JWT 后条件失效，并只恢复重试一次', async () => {
    const userId = await createUser('mobile-portal-recovery');
    seedCredential(userId, 'portal_jwt', 'portal-rejected', null);
    seedCredential(userId, 'cas_tgc', null, '{"cookies":[]}');
    seedCredential(userId, 'jw_session', null, '{"cookies":[]}');
    const originalJw = schoolStateStore.read(userId, 'jw_session');
    const seenPortalTokens: string[] = [];
    const ticketSpy = spyOn(TicketExchanger, 'exchangePortalToken').mockResolvedValue({ token: 'portal-restored', steps: [] });
    const exchanger = {
      async exchange(portalJwt: string) {
        seenPortalTokens.push(portalJwt);
        if (portalJwt === 'portal-rejected') throw mobileYxtCredentialRejected();
        return { accessToken: 'mobile-restored', cookieJar: await sessionJar('restored') };
      },
    };
    fetchSpy = mockFetch(async () => new Response(
      JSON.stringify({ success: true, resultData: [] }),
      { status: 200 },
    ));

    installYxtExchange(exchanger);
    let result;
    try { result = await readTrades(userId); } finally { ticketSpy.mockRestore(); }
    expect(schoolStateStore.read(userId, 'jw_session')).toEqual(originalJw);
    expect(result.status).toBe(200);
    expect(seenPortalTokens).toEqual(['portal-rejected', 'portal-restored']);
  });

  it('同 epoch 迟到的 Portal 拒绝不能删除新父快照，也不触碰 JW', async () => {
    const user = await persistSchoolLogin('mobile-parent-snapshot-race', 'portal-old');
    const jw = schoolStateStore.read(user.id, 'jw_session');
    const seen: string[] = [];
    installYxtExchange({ async exchange(portalJwt) {
      seen.push(portalJwt);
      if (portalJwt === 'portal-old') {
        seedCredential(user.id, 'portal_jwt', 'portal-new', null);
        throw mobileYxtCredentialRejected();
      }
      return { accessToken: 'new-mobile', cookieJar: await sessionJar() };
    } });
    fetchSpy = mockFetch(async () => Response.json({ success: true, resultData: [] }));
    expect((await readTrades(user.id)).status).toBe(200);
    expect(seen).toEqual(['portal-old', 'portal-new']);
    expect(schoolStateStore.read(user.id, 'portal_jwt')?.value).toBe('portal-new');
    expect(schoolStateStore.read(user.id, 'jw_session')).toEqual(jw);
  });

  it('网络重试耗尽和超时仍允许 stale，未知协议故障不允许', async () => {
    const userId = await createUser('mobile-network-exhausted');
    const stored = await sessions.createIfLoginEpochMatches({ userId, expectedLoginEpoch: 0,
      accessToken: 'still-valid', cookieJar: await sessionJar() });
    for (const failure of [Object.assign(new Error('connect failed'), { code: 'ConnectionRefused' }),
      new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })]) {
      fetchSpy?.mockRestore();
      fetchSpy = mockFetch(async () => { throw failure; });
      await expect(readTrades(userId)).rejects.toMatchObject({ code: 3005, kind: 'unavailable', staleAllowed: true });
    }
    fetchSpy?.mockRestore();
    fetchSpy = mockFetch(async () => { throw new Error('REQUEST_TIMEOUT'); });
    await expect(readTrades(userId)).rejects.toMatchObject({ code: 3004, kind: 'timeout', staleAllowed: true });
    fetchSpy.mockRestore();
    fetchSpy = mockFetch(async () => { throw new Error('decoder secret'); });
    await expect(readTrades(userId)).rejects.toMatchObject({ code: 3005, kind: 'protocol' });
    expect(await sessions.read(userId)).toEqual(stored);
  });

  it('基础 CAS 明确要求交互才返回 3003，业务层不能以缓存掩盖', async () => {
    const userId = await createUser('mobile-interactive-required');
    schoolStateStore.markInteraction(userId, 0, 'captcha_required');
    await expect(readTrades(userId)).rejects.toMatchObject({ code: 3003, kind: 'interaction-required' });
    const month = currentMonthOffset(0);
    await CacheService.set(mobileYxtTransactionCacheKey(userId, month), { transactions: [], truncated: false }, 0, 'mobile-yxt');
    await expect(new ECardOverviewService(portalBalance, new MobileYxtTradeClient(), noQuota)
      .getOverview(userId, 'student', month, true)).rejects.toMatchObject({ code: 3003 });
  });

  it('认证拒绝禁止 stale fallback，超时和可用性故障仍按既有策略回退缓存', async () => {
    const userId = await createUser('mobile-stale-errors');
    const month = currentMonthOffset(0);
    const key = mobileYxtTransactionCacheKey(userId, month);
    await CacheService.set(key, { transactions: [], truncated: false }, 0, 'mobile-yxt');
    const rejectedTrades = { async listMonth() { throw mobileYxtCredentialRejected(); } };
    expect(mobileYxtTimeout().staleAllowed).toBe(true);
    expect(mobileYxtUnavailable().staleAllowed).toBe(true);
    const timeoutTrades = { async listMonth() { throw mobileYxtTimeout(); } };
    const unavailableTrades = { async listMonth() { throw mobileYxtUnavailable(); } };

    await expect(new ECardOverviewService(portalBalance, rejectedTrades, noQuota)
      .getOverview(userId, 'student', month, true))
      .rejects.toMatchObject({ code: ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, kind: 'credential', staleAllowed: false });
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
  it('重建后的第二次 401 条件删除对应 generation，并返回 3005', async () => {
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
    fetchSpy = mockFetch(async () => new Response(
      JSON.stringify({ success: false }),
      { status: 401 },
    ));

    installYxtExchange(exchanger);
    await expect(readTrades(user.id))
      .rejects.toMatchObject({ code: ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, kind: 'credential', staleAllowed: false });
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
    fetchSpy = mockFetch(async (_input, init) => {
      const token = new Headers(init?.headers).get('authorization');
      if (token === 'old-mobile') {
        started();
        await releasePromise;
        return new Response('{}', { status: 401 });
      }
      return new Response(JSON.stringify({ success: true, resultData: [] }), { status: 200 });
    });
    const request = readTrades(user.id);
    const settled = Promise.allSettled([request]);
    try {
      await Promise.race([startedPromise, request.then(() => {
        throw new Error('请求未进入预期阻塞点便已完成');
      })]);
      expect(await sessions.invalidateGeneration(user.id, old!.generation)).toBe(true);
      const fresh = await sessions.createIfLoginEpochMatches({
        userId: user.id,
        expectedLoginEpoch: epoch,
        accessToken: 'new-mobile',
        cookieJar: await sessionJar('new'),
      });
      release();
      expect((await request).status).toBe(200);
      expect(await sessions.read(user.id)).toEqual(fresh);
    } finally {
      release();
      await settled;
    }
  });
});
