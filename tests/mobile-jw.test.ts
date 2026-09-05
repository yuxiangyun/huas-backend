/**
 * [INPUT]: 依赖真实协议脱敏结构、隔离 SQLite、移动教务 SSO/会话/解析器与 Academic reader
 * [OUTPUT]: 验证 500+401 恢复、基础恢复五秒冷却与错误穿透、Portal 失效、并发/epoch/坏行、只读参数、日期映射与刷新缓存合同
 * [POS]: tests 的移动教务专项回归，网络全部替身，真实账号只由独立 live E2E 注入
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { clearSocialTestData } from './social-database';
import { HttpClient } from '../src/modules/campus-integrations/http/http-client';
import { MobileJwAuthExchanger, readH5LoginToken } from '../src/modules/campus-integrations/mobile-jw/auth-exchanger';
import { MobileJwSessionExecutor } from '../src/modules/campus-integrations/mobile-jw/session-executor';
import { SqliteMobileJwSessionRepository } from '../src/modules/campus-integrations/mobile-jw/session-repository';
import { MobileJwScheduleClient } from '../src/modules/campus-integrations/mobile-jw/schedule-client';
import { parseMobileJwWeek } from '../src/modules/campus-integrations/mobile-jw/schedule-parser';
import { credentialRejected, isSessionExpired, protocolFailure } from '../src/modules/campus-integrations/mobile-jw/errors';
import { advanceSchoolLoginEpoch } from '../src/modules/campus-integrations/credential-recovery/school-login-context';
import { CredentialManager } from '../src/modules/campus-integrations/credential-recovery/credential-manager';
import { CredentialManagerPortalCredentialReader } from '../src/modules/campus-integrations/credential-recovery/portal-credential-reader';
import { TicketExchanger } from '../src/modules/campus-integrations/cas/ticket-exchanger';
import { MobileJwScheduleApplicationService } from '../src/modules/academic/application/mobile-jw-schedule-service';
import { academicCache, academicRefreshFallback } from '../src/modules/academic/infrastructure/cache-store';

let userId: number;
const originalRequest = HttpClient.prototype.request;
const sessions = new SqliteMobileJwSessionRepository();
const deadline = () => Date.now() + 10_000;
const ok = () => Response.json({ code: '1', data: [] });
const rejected = () => Response.json({ code: '401', Msg: '非法访问：/semesterList' }, { status: 500 });
const portal = { readOrRestore: async () => ({ portalJwt: 'portal-fixture', loginEpoch: 0 }), rejectIfCurrent: async () => {} };

beforeEach(async () => {
  await clearSocialTestData(getDb());
  userId = getDb().insert(schema.users).values({ studentId: 'mobile-jw-test', createdAt: new Date(), lastLoginAt: new Date() }).returning().get()!.id;
});
afterEach(() => { HttpClient.prototype.request = originalRequest; });

function fixture(week = 1, empty = false) {
  const course = { courseName: '测试课程', teacherName: '测试教师', location: '测试教室', classTime: '10102', classWeek: '1-8(周)' };
  const monday = Date.parse('2026-09-07T00:00:00Z') + (week - 1) * 7 * 86_400_000;
  return [{
    week: String(week), weekday: '六',
    date: Array.from({ length: 7 }, (_, i) => ({ mxrq: new Date(monday + i * 86_400_000).toISOString().slice(0, 10) })),
    nodesLst: Array.from({ length: 10 }, (_, i) => ({ nodeNumber: String(i + 1).padStart(2, '0'), nodeName: `第${i + 1}节` })),
    courses: empty ? [] : [course],
    item: [empty ? [] : [[course]], [], [], [], [], [], []],
    topInfo: [{ semesterId: '2026-2027-1', maxWeek: '19' }],
  }];
}

describe('移动教务真实协议与会话恢复', () => {
  it('只认已验证失效证据，不把 403、503、数字 401 或无课当过期', () => {
    expect(isSessionExpired(500, { code: '401' })).toBe(true);
    expect(isSessionExpired(200, { code: '401' })).toBe(true);
    expect(isSessionExpired(401, null)).toBe(true);
    for (const [status, body] of [[403, {}], [503, { code: '401' }], [200, { code: 401 }], [200, { code: '1', data: [] }]] as const) {
      expect(isSessionExpired(status, body)).toBe(false);
    }
  });

  it('真实 SSO 302 casLogin token 不同于 Portal，跨源 location 不得携密访问', async () => {
    let calls = 0;
    HttpClient.prototype.request = async function(url, options) {
      calls += 1;
      expect(new URL(url).searchParams.get('token')).toBe('portal-fixture');
      expect(options?.isAuthFlow).toBe(true);
      expect(this.serializeJar()).not.toContain('portal-fixture');
      return new Response(null, { status: 302, headers: { location: '/#/casLogin?token=h5-fixture&userType=2' } });
    };
    expect(await new MobileJwAuthExchanger().exchange('portal-fixture', deadline())).toBe('h5-fixture');
    expect(calls).toBe(1);
    HttpClient.prototype.request = async () => new Response(null, { status: 302, headers: { location: 'https://other.invalid/#/casLogin?token=secret' } });
    await expect(new MobileJwAuthExchanger().exchange('portal-fixture', deadline())).rejects.toMatchObject({ kind: 'protocol' });
    expect(() => readH5LoginToken(new URL('https://jwyd.huas.edu.cn/#/casLogin?code=2'))).toThrow();
    for (const token of ['null', 'undefined', '']) {
      expect(() => readH5LoginToken(new URL(`https://jwyd.huas.edu.cn/#/casLogin?token=${token}`))).toThrow();
    }
  });

  it('复用正常会话；500+401 后仅交换、重试一次', async () => {
    let exchanges = 0;
    let requests = 0;
    await sessions.createIfLoginEpochMatches(userId, 0, 'old-h5');
    const executor = new MobileJwSessionExecutor({ exchange: async () => { exchanges += 1; return 'new-h5'; } }, sessions, portal);
    HttpClient.prototype.request = async (_url, options) => {
      requests += 1;
      return new Headers(options?.headers).get('token') === 'old-h5' ? rejected() : ok();
    };
    expect((await executor.post(userId, 'semesters', {})).status).toBe(200);
    expect(exchanges).toBe(1);
    expect(requests).toBe(2);
    await executor.post(userId, 'semesters', {});
    expect(exchanges).toBe(1);
    expect((await sessions.read(userId))?.token).toBe('new-h5');
  });

  it('第二次仍 401 时删除新坏会话并返回 3003，禁止无限重建', async () => {
    let exchanges = 0;
    const executor = new MobileJwSessionExecutor({ exchange: async () => `h5-${++exchanges}` }, sessions, portal);
    HttpClient.prototype.request = async () => rejected();
    await expect(executor.post(userId, 'current', {})).rejects.toMatchObject({ code: 3003 });
    expect(exchanges).toBe(2);
    expect(await sessions.read(userId)).toBeNull();
  });

  it('同用户并发失效只重建一次，迟到的旧 generation 不删除新会话', async () => {
    let exchanges = 0;
    const old = await sessions.createIfLoginEpochMatches(userId, 0, 'old-h5');
    const executor = new MobileJwSessionExecutor({ exchange: async () => { exchanges += 1; return 'new-h5'; } }, sessions, portal);
    HttpClient.prototype.request = async (_url, options) => new Headers(options?.headers).get('token') === 'old-h5' ? rejected() : ok();
    await Promise.all(Array.from({ length: 8 }, () => executor.post(userId, 'current', {})));
    expect(exchanges).toBe(1);
    await sessions.invalidateGeneration(userId, old!.generation);
    expect((await sessions.read(userId))?.token).toBe('new-h5');
  });

  it('Portal 交换拒绝仅条件失效并窄恢复一次，第二次拒绝也清理坏 Portal', async () => {
    let rejects = 0;
    let exchanges = 0;
    const executor = new MobileJwSessionExecutor({ exchange: async () => { exchanges += 1; throw credentialRejected(); } }, sessions, {
      ...portal, rejectIfCurrent: async () => { rejects += 1; },
    });
    await expect(executor.post(userId, 'current', {})).rejects.toMatchObject({ code: 3003 });
    expect(exchanges).toBe(2);
    expect(rejects).toBe(2);
  });

  it('交换期间真实登录 epoch 变化，丢弃旧 token 并依据新 epoch 重建', async () => {
    let epoch = 0;
    let exchanges = 0;
    const executor = new MobileJwSessionExecutor({ exchange: async () => {
      if (++exchanges === 1) epoch = getDb().transaction((tx) => advanceSchoolLoginEpoch(tx, userId, new Date()));
      return `h5-${exchanges}`;
    } }, sessions, { ...portal, readOrRestore: async () => ({ portalJwt: 'portal-fixture', loginEpoch: epoch }) });
    HttpClient.prototype.request = async () => ok();
    await executor.post(userId, 'current', {});
    expect(exchanges).toBe(2);
    expect(await sessions.read(userId)).toMatchObject({ token: 'h5-2', loginEpoch: 1 });
    expect(await sessions.createIfLoginEpochMatches(userId, 0, 'late-h5')).toBeNull();
  });

  it('损坏会话读取时淘汰；Portal 按值条件删除不越过 JW', async () => {
    await sessions.createIfLoginEpochMatches(userId, 0, 'h5');
    getDb().update(schema.credentials).set({ cookieJar: 'unexpected' }).where(eq(schema.credentials.system, 'derived_session:mobile_jw')).run();
    expect(await sessions.read(userId)).toBeNull();
    await CredentialManager.storeCredential(userId, 'portal_jwt', 'new-portal', null, 60000);
    await CredentialManager.storeCredential(userId, 'jw_session', null, '{"cookies":[]}', 60000);
    await new CredentialManagerPortalCredentialReader().rejectIfCurrent(userId, 'old-portal');
    expect((await CredentialManager.getCredential(userId, 'portal_jwt'))?.value).toBe('new-portal');
    expect(await CredentialManager.getCredential(userId, 'jw_session')).not.toBeNull();
  });

  it('Portal-only 并发缺口将 TGC 换票一起合流，不调用 JW', async () => {
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60000);
    const originalPortal = TicketExchanger.exchangePortalToken;
    const originalJw = TicketExchanger.exchangeJwSession;
    let exchanges = 0;
    TicketExchanger.exchangePortalToken = async () => { exchanges += 1; return { token: 'portal-refreshed', steps: [] }; };
    TicketExchanger.exchangeJwSession = async () => { throw new Error('JW_MUST_NOT_BE_CALLED'); };
    try {
      const values = await Promise.all(Array.from({ length: 8 }, () => CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId, deadline())));
      expect(exchanges).toBe(1);
      expect(values.every((value) => value?.value === 'portal-refreshed')).toBe(true);
    } finally {
      TicketExchanger.exchangePortalToken = originalPortal;
      TicketExchanger.exchangeJwSession = originalJw;
    }
  });

  it('503、未知 JSON 不清会话；传输错误不泄露 token URL', async () => {
    const stored = await sessions.createIfLoginEpochMatches(userId, 0, 'h5');
    const executor = new MobileJwSessionExecutor({ exchange: async () => { throw new Error('NO_EXCHANGE'); } }, sessions, portal);
    const client = new MobileJwScheduleClient(executor);
    HttpClient.prototype.request = async () => Response.json({ code: '0' }, { status: 503 });
    await expect(client.current(userId)).rejects.toMatchObject({ kind: 'unavailable' });
    HttpClient.prototype.request = async () => Response.json({ wrong: true });
    await expect(client.current(userId)).rejects.toMatchObject({ kind: 'protocol' });
    expect((await sessions.read(userId))?.generation).toBe(stored!.generation);
    HttpClient.prototype.request = async () => { throw new Error('sensitive https://host/?token=secret'); };
    await expect(client.current(userId)).rejects.toThrow('移动教务响应协议无法识别');
  });

  it('瞬时 500/503 与连接错误有限重试成功，不重置有效凭证', async () => {
    for (const failure of [500, 503, 'network'] as const) {
      const stored = await sessions.createIfLoginEpochMatches(userId, 0, 'stable-h5');
      let calls = 0;
      const executor = new MobileJwSessionExecutor({ exchange: async () => { throw new Error('MUST_NOT_REBUILD'); } }, sessions, portal);
      HttpClient.prototype.request = async () => {
        if (++calls === 1) {
          if (failure === 'network') throw new Error('ECONNRESET');
          return Response.json({ code: '0' }, { status: failure });
        }
        return ok();
      };
      expect((await executor.post(userId, 'current', {})).status).toBe(200);
      expect(calls).toBe(2);
      expect((await sessions.read(userId))?.generation).toBe(stored!.generation);
    }
  });

  it('SSO 瞬时 503 在同一预算内恢复，不误删 Portal', async () => {
    let requests = 0;
    let rejects = 0;
    HttpClient.prototype.request = async (url) => {
      if (new URL(url).pathname.endsWith('loginSso_hnwlxy')) {
        if (++requests === 1) return new Response(null, { status: 503 });
        return new Response(null, { status: 302, headers: { location: '/#/casLogin?token=h5-fixture&userType=2' } });
      }
      return ok();
    };
    const executor = new MobileJwSessionExecutor(new MobileJwAuthExchanger(), sessions, { ...portal, rejectIfCurrent: async () => { rejects += 1; } });
    await executor.post(userId, 'current', {});
    expect(requests).toBe(2);
    expect(rejects).toBe(0);
  });

  it('迟到 TGC 换票结果不能覆盖真实 CAS 新 epoch 的 Portal', async () => {
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60000);
    const original = TicketExchanger.exchangePortalToken;
    TicketExchanger.exchangePortalToken = async () => {
      getDb().transaction((tx) => advanceSchoolLoginEpoch(tx, userId, new Date()));
      await CredentialManager.storeCredential(userId, 'portal_jwt', 'new-login-portal', null, 60000);
      return { token: 'late-old-portal', steps: [] };
    };
    try {
      const value = await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId, deadline());
      expect(value?.value).toBe('new-login-portal');
      expect((await CredentialManager.getCredential(userId, 'portal_jwt'))?.value).toBe('new-login-portal');
    } finally { TicketExchanger.exchangePortalToken = original; }
  });

  it('TGC 换票期间凭证被清理，迟到成功不得复活旧学校上下文', async () => {
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60000);
    const original = TicketExchanger.exchangePortalToken;
    TicketExchanger.exchangePortalToken = async () => {
      await CredentialManager.invalidateSchoolCredentials(userId);
      await CredentialManager.markInteractiveLoginRequired(userId);
      return { token: 'late-old-portal', steps: [] };
    };
    try {
      expect(await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId, deadline())).toBeNull();
      expect(await CredentialManager.getCredential(userId, 'cas_tgc')).toBeNull();
      expect(await CredentialManager.getCredential(userId, 'portal_jwt')).toBeNull();
      expect(await CredentialManager.requiresInteractiveLogin(userId)).toBe(true);
    } finally { TicketExchanger.exchangePortalToken = original; }
  });

  it('基础静默登录的 500 和嵌套网络故障保留错误并只冷却五秒', async () => {
    const { AuthEngine } = await import('../src/modules/campus-integrations/cas/auth-engine');
    const { CryptoHelper } = await import('../src/utils/crypto');
    const { config } = await import('../src/config');
    await getDb().update(schema.users).set({ encryptedPassword: CryptoHelper.encryptAES('fixture-password', config.jwtSecret) })
      .where(eq(schema.users.id, userId));
    const original = AuthEngine.prototype.getCaptcha;
    let now = Date.now();
    const clock = spyOn(Date, 'now').mockImplementation(() => now);
    try {
      for (const failure of [new Error('CAS_LOGIN_HTTP_500'), new Error('request failed', { cause: { code: 'ECONNREFUSED' } })]) {
        let attempts = 0;
        AuthEngine.prototype.getCaptcha = async () => { attempts += 1; throw failure; };
        for (let attempt = 0; attempt < 4; attempt += 1) {
          await expect(CredentialManager.silentReAuth(userId, deadline(), 'portal_jwt')).rejects.toBe(failure);
        }
        expect(attempts).toBe(1);
        now += 5_000;
        await expect(CredentialManager.silentReAuth(userId, deadline(), 'portal_jwt')).rejects.toBe(failure);
        expect(attempts).toBe(2);
        now += 5_000;
        expect(await CredentialManager.requiresInteractiveLogin(userId)).toBe(false);
      }
    } finally { AuthEngine.prototype.getCaptcha = original; clock.mockRestore(); }
  });

  it('只读 POST 参数位于 query，学校 token 只在请求头；过期 deadline 不发请求', async () => {
    await sessions.createIfLoginEpochMatches(userId, 0, 'h5');
    const executor = new MobileJwSessionExecutor(undefined, sessions, portal);
    const client = new MobileJwScheduleClient(executor);
    let calls = 0;
    HttpClient.prototype.request = async (url, options) => {
      calls += 1;
      expect(new URL(url).pathname).toBe('/njwhd/student/curriculum');
      expect(new URL(url).searchParams.get('week')).toBe('3');
      expect(options?.method).toBe('POST');
      expect(options?.body).toBeUndefined();
      expect(new Headers(options?.headers).get('token')).toBe('h5');
      return Response.json({ code: 1, data: fixture(3) });
    };
    await client.current(userId, { week: 3 });
    await expect(client.current(userId, {}, Date.now() - 1)).rejects.toMatchObject({ code: 3004 });
    expect(() => client.current(userId, { week: 0 })).toThrow();
    expect(calls).toBe(1);
  });
});

describe('移动教务解析与 Academic 缓存', () => {
  it('保持日期、同节并行课程与非连续节次，不把缺载荷当空课表', () => {
    const data = fixture();
    const extra = { ...data[0].courses[0], courseName: '并行课程', classTime: '10103' };
    data[0].item[0][0].push(extra); data[0].courses.push(extra);
    const result = parseMobileJwWeek(data);
    expect(result.courses.map((course) => course.section)).toEqual(['1-2', '1', '3']);
    expect(result.courses.every((course) => course.date === '2026-09-07')).toBe(true);
    expect(parseMobileJwWeek(fixture(18, true)).courses).toEqual([]);
    expect(() => parseMobileJwWeek([])).toThrow();
    data[0].date[1].mxrq = '2026-09-20';
    expect(() => parseMobileJwWeek(data)).toThrow();
  });

  it('按真实周锚点查询目标周，普通命中缓存而 refresh 回源，历史范围走后备', async () => {
    const calls: number[] = [];
    const client = { current: async (_userId: number, input: { week?: number } = {}) => {
      calls.push(input.week ?? 1); return { data: fixture(input.week ?? 1), message: null };
    } };
    const service = new MobileJwScheduleApplicationService(client, { cache: academicCache, refreshFallback: academicRefreshFallback });
    const first = await service.getCurrentSchedule(userId, 'mobile-jw-test', '2026-09-23');
    expect(calls).toEqual([1, 3]);
    expect(first.data.courses[0].date).toBe('2026-09-21');
    expect((await service.getCurrentSchedule(userId, 'mobile-jw-test', '2026-09-24'))._meta.cached).toBe(true);
    expect(calls).toEqual([1, 3]);
    await service.getCurrentSchedule(userId, 'mobile-jw-test', '2026-09-23', true);
    expect(calls).toEqual([1, 3, 1, 3]);
    await expect(service.getCurrentSchedule(userId, 'mobile-jw-test', '2026-08-31')).rejects.toThrow('SCHEDULE_SOURCE_UNSUPPORTED');
    expect(await service.getStaleSchedule('mobile-jw-test', '2026-09-23', protocolFailure(), true)).toBeNull();
    expect(await service.getStaleSchedule('mobile-jw-test', '2026-09-23', credentialRejected(), true)).toBeNull();
  });

  it('上游忽略 week 返回另一周时拒绝写入目标周缓存', async () => {
    const service = new MobileJwScheduleApplicationService({ current: async () => ({ data: fixture(), message: null }) }, { cache: academicCache, refreshFallback: academicRefreshFallback });
    await expect(service.getCurrentSchedule(userId, 'mobile-jw-test', '2026-09-21', true)).rejects.toMatchObject({ kind: 'protocol' });
    expect(await academicCache.get('mobile-jw-schedule:mobile-jw-test:2026-09-21')).toBeNull();
  });
});
