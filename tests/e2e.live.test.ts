/**
 * [INPUT]: 依赖显式启用的真实学校账号、隔离 E2E SQLite、应用路由与学校只读上游
 * [OUTPUT]: 串行验证真实登录、mobile-jw 课表及恢复、mobile-yxt 查询、JW 凭证恢复与可选 CAS 静默重认证
 * [POS]: tests 唯一真实学校网络入口；每个场景独立登录，断言来源及非旧缓存结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { rmSync } from 'node:fs';
import { getDb, closeDatabase, schema } from '../src/db';
import { registerRoutes } from '../src/routes';
import { onAppError } from '../src/middleware/error.middleware';
import { drainBackgroundTasks } from '../src/runtime/background-tasks';
import { schoolAccessMaintenance } from '../src/modules/campus-integrations/school-access/school-access';
import { flushShutdownHooks } from '../src/runtime/shutdown-hooks';
import { AnalyticsService } from '../src/modules/operations/infrastructure/analytics-service';

const username = process.env.HUAS_E2E_USERNAME!;
const password = process.env.HUAS_E2E_PASSWORD!;
const runSilentReauth = process.env.HUAS_E2E_RUN_SILENT_REAUTH === '1';
const root = (globalThis as { __HUAS_E2E_ROOT__?: string }).__HUAS_E2E_ROOT__;

setDefaultTimeout(30_000);
let app: Hono;

type Login = { token: string; userId: number };

async function login(): Promise<Login> {
  const response = await app.request('http://localhost/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json() as any;
  if (body.needCaptcha) throw new Error('CAS 当前要求验证码，无法无交互运行 E2E。');
  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  expect(typeof body.data?.token).toBe('string');
  const user = getDb().select().from(schema.users).where(eq(schema.users.studentId, username)).get();
  expect(user).toBeDefined();
  return { token: body.data.token, userId: user!.id };
}

async function authorizedRequest(token: string, path: string): Promise<Response> {
  return app.request(`http://localhost${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

async function freshJwSchedule(token: string): Promise<void> {
  const response = await authorizedRequest(token, '/api/schedule?preferred_source=jw&refresh=true');
  const body = await response.json() as any;
  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body._meta).toMatchObject({ source: 'jw', primary_source: 'jw', cached: false });
  expect(body._meta.fallback).toBeUndefined();
  expect(body._meta.stale).not.toBe(true);
  expect(body._meta.refresh_failed).not.toBe(true);
  expect(body.data?.message).toBeUndefined();
}

const jwCredential = (userId: number) => and(
  eq(schema.credentials.userId, userId), eq(schema.credentials.system, 'jw_session'),
);

describe('Live E2E: 学校只读上游', () => {
  beforeAll(() => {
    app = new Hono();
    app.onError(onAppError);
    registerRoutes(app);
  });

  afterAll(async () => {
    try {
      await drainBackgroundTasks();
      await schoolAccessMaintenance.drainRecoveries();
      await drainBackgroundTasks();
      const analytics = await AnalyticsService.shutdown();
      if (!analytics.success) throw new Error('E2E analytics flush failed');
      const flushes = await flushShutdownHooks();
      for (const result of flushes) if (!result.ok) throw result.error;
    } finally {
      closeDatabase();
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it('真实 CAS 登录并落库 JW 与 TGC 凭证', async () => {
    const { userId } = await login();
    const credentials = getDb().select().from(schema.credentials).where(eq(schema.credentials.userId, userId)).all();
    expect(credentials.map(row => row.system)).toContain('cas_tgc');
    expect(credentials.map(row => row.system)).toContain('jw_session');
  }, 60_000);

  it('移动教务：真实课表、缓存复用与坏 H5 令牌恢复', async () => {
    const { token, userId } = await login();
    const { MobileJwScheduleClient } = await import('../src/modules/campus-integrations/mobile-jw/schedule-client');
    const { parseMobileJwWeek } = await import('../src/modules/campus-integrations/mobile-jw/schedule-parser');
    const { mobileJwSessionRepository } = await import('../src/modules/campus-integrations/mobile-jw/session-repository');
    const initial = parseMobileJwWeek((await new MobileJwScheduleClient().current(userId)).data);
    const read = async (refresh: boolean) => {
      const response = await authorizedRequest(token, `/api/schedule?preferred_source=mobile-jw&date=${initial.weekStartDate}&refresh=${refresh}`);
      const body = await response.json() as any;
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body._meta).toMatchObject({ source: 'mobile-jw', primary_source: 'mobile-jw' });
      expect(body._meta.fallback).toBeUndefined();
      expect(body._meta.stale).not.toBe(true);
      expect(body.data.courses.length).toBe(initial.courses.length);
      expect(JSON.stringify(body)).not.toMatch(/portalJwt|JSESSIONID|accessToken|generation/);
      return body;
    };
    expect((await read(true))._meta.cached).toBe(false);
    expect((await read(false))._meta.cached).toBe(true);
    const previous = await mobileJwSessionRepository.read(userId);
    expect(previous).not.toBeNull();
    getDb().update(schema.credentials).set({
      value: JSON.stringify({ v: 1, ...previous, token: 'invalid-live-e2e-token' }),
    }).where(and(eq(schema.credentials.userId, userId), eq(schema.credentials.system, 'derived_session:mobile_jw'))).run();
    expect((await read(true))._meta.cached).toBe(false);
    expect((await mobileJwSessionRepository.read(userId))?.generation).not.toBe(previous!.generation);
  }, 150_000);

  it('mobile-yxt 真实读取校园卡当前月账单', async () => {
    const { token, userId } = await login();
    const response = await authorizedRequest(token, '/api/ecard/overview?refresh=true');
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.data?.month).toBe('string');
    expect(Array.isArray(body.data?.transactions)).toBe(true);
    expect(typeof body.data?.totals?.consumptionCents).toBe('number');
    expect(typeof body.data?.partial).toBe('boolean');
    expect(body.data?.freshness?.transactions).toMatchObject({ source: 'mobile-yxt', cached: false });
    expect(body.data?.staleParts).not.toContain('transactions');
    expect(JSON.stringify(body.data)).not.toMatch(/accessToken|refreshToken|JSESSIONID|authorization|\btid\b/i);
    const row = getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, userId), eq(schema.credentials.system, 'derived_session:mobile_yxt'),
    )).get();
    expect(row).toBeDefined();
    expect(row!.expiresAt).toBeNull();
  }, 60_000);

  it('mobile-yxt 真实读取电费及上游账户状态', async () => {
    const { token } = await login();
    const response = await authorizedRequest(token, '/api/utilities/electricity?refresh=true');
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.data?.roomDisplayName).toBe('string');
    expect(body.data?.priceCentsPerKwh === null || typeof body.data?.priceCentsPerKwh === 'number').toBe(true);
    expect(body.data?.remainingKwh === null || typeof body.data?.remainingKwh === 'string').toBe(true);
    expect(typeof body.data?.accountStatus).toBe('string');
    expect(body._meta).toMatchObject({ source: 'mobile-yxt', cached: false });
    expect(body._meta.stale).not.toBe(true);
    expect(body.data?.detailsAvailable).toBe(false);
    expect(body.data?.officialPaymentAvailable).toBe(false);
    expect(JSON.stringify(body.data)).not.toMatch(/accessToken|refreshToken|JSESSIONID|authorization|\btid\b/i);
  }, 60_000);

  it('JW 凭证过期后真实刷新并返回 JW 当前课表', async () => {
    const { token, userId } = await login();
    getDb().update(schema.credentials).set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(jwCredential(userId)).run();
    await freshJwSchedule(token);
    const row = getDb().select().from(schema.credentials).where(jwCredential(userId)).get();
    expect(row).toBeDefined();
    expect(row!.expiresAt?.getTime() ?? 0).toBeGreaterThan(Date.now());
  }, 60_000);

  it('JW 运行时 SESSION_EXPIRED 后真实恢复并返回 JW 当前课表', async () => {
    const { token, userId } = await login();
    const invalidCookie = '{"version":"tough-cookie@5.0.0","storeType":"MemoryCookieStore","rejectPublicSuffixes":true,"enableLooseMode":false,"allowSpecialUseDomain":true,"prefixSecurity":"silent","cookies":[]}';
    getDb().update(schema.credentials).set({
      cookieJar: invalidCookie,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    }).where(jwCredential(userId)).run();
    await freshJwSchedule(token);
    const row = getDb().select().from(schema.credentials).where(jwCredential(userId)).get();
    expect(row).toBeDefined();
    expect(row!.cookieJar).not.toBe(invalidCookie);
  }, 60_000);

  (runSilentReauth ? it : it.skip)('可选：TGC 与 JW 同时过期后真实 CAS 静默重认证', async () => {
    const { token, userId } = await login();
    const expiredAt = new Date(Date.now() - 60_000);
    getDb().update(schema.credentials).set({ expiresAt: expiredAt }).where(jwCredential(userId)).run();
    getDb().update(schema.credentials).set({ expiresAt: expiredAt }).where(and(
      eq(schema.credentials.userId, userId), eq(schema.credentials.system, 'cas_tgc'),
    )).run();
    await freshJwSchedule(token);
    const jw = getDb().select().from(schema.credentials).where(jwCredential(userId)).get();
    const tgc = getDb().select().from(schema.credentials).where(and(
      eq(schema.credentials.userId, userId), eq(schema.credentials.system, 'cas_tgc'),
    )).get();
    expect(jw?.expiresAt?.getTime() ?? 0).toBeGreaterThan(Date.now());
    expect(tgc?.expiresAt?.getTime() ?? 0).toBeGreaterThan(Date.now());
  }, 90_000);
});
