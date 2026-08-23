/**
 * [INPUT]: 依赖隔离 SQLite、学校登录上下文、mobile-yxt Cookie codec/repository/executor 与可控 fetch
 * [OUTPUT]: 验证严格派生命名空间清理、损坏 CookieJar 事务淘汰、最小权限读取/写入、自动重建与低敏感失败语义
 * [POS]: tests 的 mobile-yxt 认证状态专项反例套件，把凭证状态机安全边界从账单/电费大套件中独立出来
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { CookieJar } from 'tough-cookie';
import { getDb, schema } from '../src/db';
import {
  advanceSchoolLoginEpoch,
  readSchoolLoginEpoch,
} from '../src/modules/campus-integrations/credential-recovery/school-login-context';
import { URLS } from '../src/modules/campus-integrations/endpoints';
import { HttpClient } from '../src/modules/campus-integrations/http/http-client';
import { type MobileYxtSessionExchangePort } from '../src/modules/campus-integrations/mobile-yxt/auth-exchanger';
import { MobileYxtSessionExecutor } from '../src/modules/campus-integrations/mobile-yxt/session-executor';
import { SqliteMobileYxtSessionRepository } from '../src/modules/campus-integrations/mobile-yxt/session-repository';
import { Logger } from '../src/utils/logger';

const sessions = new SqliteMobileYxtSessionRepository();
let fetchSpy: ReturnType<typeof spyOn> | null = null;

async function createUser(studentId: string): Promise<number> {
  const now = new Date();
  const rows = await getDb().insert(schema.users).values({
    studentId,
    name: `test-${studentId}`,
    className: 'test-class',
    createdAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
  }).returning({ id: schema.users.id });
  return rows[0].id;
}

async function validCookieJar(value = 'valid-mobile-session'): Promise<string> {
  const jar = new CookieJar();
  await jar.setCookie(`JSESSIONID=${value}; Path=/server; HttpOnly`, URLS.mobileYxtGetToken);
  return JSON.stringify(jar.toJSON());
}

function serializedCookie(overrides: Record<string, unknown> = {}, extraCookies: unknown[] = []): string {
  return JSON.stringify({
    cookies: [{
      key: 'JSESSIONID',
      value: 'mobile-session',
      domain: 'mobile-yxt.huas.edu.cn',
      path: '/server',
      hostOnly: true,
      ...overrides,
    }, ...extraCookies],
  });
}

async function insertStoredSession(userId: number, cookieJar: string, accessToken = 'stored-access') {
  const now = new Date();
  await getDb().insert(schema.credentials).values({
    userId,
    system: 'derived_session:mobile_yxt',
    value: JSON.stringify({
      v: 1,
      accessToken,
      loginEpoch: readSchoolLoginEpoch(getDb(), userId),
      generation: `generation-${userId}`,
    }),
    cookieJar,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

async function sessionRowCount(userId: number): Promise<number> {
  const rows = await getDb().select({ id: schema.credentials.id }).from(schema.credentials).where(and(
    eq(schema.credentials.userId, userId),
    eq(schema.credentials.system, 'derived_session:mobile_yxt'),
  ));
  return rows.length;
}

beforeEach(async () => {
  await getDb().delete(schema.credentials);
});

afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = null;
});

describe('派生会话命名空间', () => {
  it('推进 epoch 只删除严格 derived_session:* 前缀，保留相似及其他系统', async () => {
    const userId = await createUser('mobile-derived-namespace');
    const now = new Date();
    for (const system of [
      'derived_session:mobile_yxt',
      'derivedXsession:unrelated',
      'derived-session:unrelated',
      'other_system',
    ]) {
      await getDb().insert(schema.credentials).values({
        userId,
        system,
        value: system,
        cookieJar: null,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    getDb().transaction((tx) => advanceSchoolLoginEpoch(tx, userId, now));

    const systems = (await getDb().select({ system: schema.credentials.system })
      .from(schema.credentials).where(eq(schema.credentials.userId, userId)))
      .map((row) => row.system).sort();
    expect(systems).toEqual([
      'derived-session:unrelated',
      'derivedXsession:unrelated',
      'other_system',
      'school_login_epoch',
    ]);
  });
});

describe('CookieJar 读取与持久化合同', () => {
  it('非 JSON CookieJar 在读取事务内删除，随后由正常链路自动重建而非永久 500', async () => {
    const userId = await createUser('mobile-corrupt-rebuild');
    await insertStoredSession(userId, 'not-json-cookie-secret');
    let exchangeCount = 0;
    const exchanger: MobileYxtSessionExchangePort = {
      async exchange() {
        exchangeCount += 1;
        return { accessToken: 'rebuilt-access', cookieJar: await validCookieJar('rebuilt') };
      },
    };
    const portalReader = {
      async readOrRestore() { return { portalJwt: 'portal-for-rebuild', loginEpoch: 0 }; },
      async rejectIfCurrent() {},
    };
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      JSON.stringify({ success: true, resultData: [] }),
      { status: 200 },
    )) as any;

    const result = await new MobileYxtSessionExecutor(exchanger, sessions, portalReader)
      .post(userId, URLS.mobileYxtTradeList, {});

    expect(result.response.status).toBe(200);
    expect(exchangeCount).toBe(1);
    expect(await sessions.read(userId)).toMatchObject({ accessToken: 'rebuilt-access' });
    expect(await sessionRowCount(userId)).toBe(1);
  });

  it('缺少 cookies 数组与空 CookieJar 自动删除并返回 miss', async () => {
    for (const [suffix, cookieJar] of [
      ['missing', JSON.stringify({ version: 'tough-cookie@5.1.2' })],
      ['empty', JSON.stringify({ cookies: [] })],
    ] as const) {
      const userId = await createUser(`mobile-cookie-${suffix}`);
      await insertStoredSession(userId, cookieJar);
      expect(await sessions.read(userId)).toBeNull();
      expect(await sessionRowCount(userId)).toBe(0);
    }
  });

  it('多 Cookie、错误域、错误 Path 与空 JSESSIONID 均被拒绝并删除', async () => {
    const cases: Array<[string, string]> = [
      ['multiple', serializedCookie({}, [{
        key: 'TGC', value: 'forbidden', domain: 'mobile-yxt.huas.edu.cn', path: '/server', hostOnly: true,
      }])],
      ['domain', serializedCookie({ domain: 'portal.huas.edu.cn' })],
      ['path', serializedCookie({ path: '/' })],
      ['empty-value', serializedCookie({ value: '' })],
    ];
    for (const [suffix, cookieJar] of cases) {
      const userId = await createUser(`mobile-cookie-invalid-${suffix}`);
      await insertStoredSession(userId, cookieJar);
      expect(await sessions.read(userId)).toBeNull();
      expect(await sessionRowCount(userId)).toBe(0);
    }
  });

  it('合法单 Cookie 会话正常读取，写入边界同样拒绝越权 Jar', async () => {
    const userId = await createUser('mobile-cookie-valid');
    const legal = await validCookieJar();
    await insertStoredSession(userId, legal, 'legal-access');
    const read = await sessions.read(userId);
    expect(read).toMatchObject({ accessToken: 'legal-access', loginEpoch: 0 });
    const jar = CookieJar.fromJSON(read!.cookieJar);
    expect(await jar.getCookieString(URLS.mobileYxtTradeList)).toBe('JSESSIONID=valid-mobile-session');

    await expect(sessions.createIfLoginEpochMatches({
      userId,
      expectedLoginEpoch: 0,
      accessToken: 'must-not-persist',
      cookieJar: serializedCookie({ path: '/' }),
    })).rejects.toMatchObject({ kind: 'protocol' });
  });

  it('Cookie 与 accessToken 原文不进入错误或日志', async () => {
    const userId = await createUser('mobile-cookie-redaction');
    const cookieSecret = 'cookie-secret-must-not-leak';
    const accessSecret = 'access-secret-must-not-leak';
    const warnSpy = spyOn(Logger, 'warn').mockImplementation(() => {});
    const errorSpy = spyOn(Logger, 'error').mockImplementation(() => {});
    const exchanger: MobileYxtSessionExchangePort = {
      async exchange() {
        return {
          accessToken: accessSecret,
          cookieJar: serializedCookie({ key: 'TGC', value: cookieSecret }),
        };
      },
    };
    const portalReader = {
      async readOrRestore() { return { portalJwt: 'redacted-portal', loginEpoch: 0 }; },
      async rejectIfCurrent() {},
    };

    let caught: unknown;
    try {
      await new MobileYxtSessionExecutor(exchanger, sessions, portalReader)
        .post(userId, URLS.mobileYxtTradeList, {});
    } catch (error) {
      caught = error;
    }
    const observable = JSON.stringify({
      error: caught instanceof Error ? { name: caught.name, message: caught.message } : caught,
      warn: warnSpy.mock.calls,
      errorLogs: errorSpy.mock.calls,
    });
    expect(observable).not.toContain(cookieSecret);
    expect(observable).not.toContain(accessSecret);
    expect(await sessionRowCount(userId)).toBe(0);
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
