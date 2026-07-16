/**
 * [INPUT]: 依赖 upstream、TicketExchanger、AuthEngine、HttpClient 测试替身与隔离数据库
 * [OUTPUT]: 验证业务重试、Portal 换票瞬态网络故障透传及 CAS HTTP/维护页错误语义
 * [POS]: tests 的学校上游故障语义回归套件，防止超时和维护故障退化为凭证或密码错误
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { initDatabase, getDb, schema } from '../src/db';
import { upstream } from '../src/services/infra/upstream';
import type { HttpClient } from '../src/core/http-client';
import { TicketExchanger } from '../src/auth/ticket-exchanger';
import { AuthEngine } from '../src/auth/auth-engine';

const EMPTY_JAR_JSON = JSON.stringify({
  version: 'tough-cookie@5.0.0',
  storeType: 'MemoryCookieStore',
  rejectPublicSuffixes: true,
  enableLooseMode: false,
  allowSpecialUseDomain: true,
  prefixSecurity: 'silent',
  cookies: [],
});

let userId = 0;

async function seedUserAndCredential() {
  const db = getDb();
  const now = new Date();
  const users = await db.insert(schema.users).values({
    studentId: '2023999001',
    name: 'retry-test',
    className: 'test',
    encryptedPassword: null,
    createdAt: now,
    lastLoginAt: now,
  }).returning({ id: schema.users.id });
  userId = users[0].id;

  await db.insert(schema.credentials).values({
    userId,
    system: 'jw_session',
    value: null,
    cookieJar: EMPTY_JAR_JSON,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: now,
    updatedAt: now,
  });
}

beforeAll(() => {
  initDatabase();
});

beforeEach(async () => {
  const db = getDb();
  await db.delete(schema.treeholeCommentNotifications);
  await db.delete(schema.treeholePostLikes);
  await db.delete(schema.treeholeComments);
  await db.delete(schema.treeholePosts);
  await db.delete(schema.discoverComments);
  await db.delete(schema.discoverPostRatings);
  await db.delete(schema.discoverPosts);
  await db.delete(schema.credentials);
  await db.delete(schema.cache);
  await db.delete(schema.users);
  await seedUserAndCredential();
});

describe('upstream retry', () => {
  it('REQUEST_TIMEOUT 会自动重试一次并成功', async () => {
    let calls = 0;
    const data = await upstream(userId, 'jw', async () => {
      calls++;
      if (calls === 1) throw new Error('REQUEST_TIMEOUT');
      return 'ok';
    });

    expect(data).toBe('ok');
    expect(calls).toBe(2);
  });

  it('不可重试错误不会额外重试', async () => {
    let calls = 0;
    await expect(
      upstream(userId, 'jw', async () => {
        calls++;
        throw new Error('PARSER_FAILED');
      })
    ).rejects.toThrow('PARSER_FAILED');

    expect(calls).toBe(1);
  });

  it('重试成功后不触发凭证删除', async () => {
    let calls = 0;
    await upstream(userId, 'jw', async () => {
      calls++;
      if (calls === 1) throw new Error('REQUEST_TIMEOUT');
      return 'ok';
    });

    const db = getDb();
    const rows = await db.select()
      .from(schema.credentials)
      .where(and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.system, 'jw_session')
      ))
      .limit(1);

    expect(rows.length).toBe(1);
  });
});

describe('auth upstream failure semantics', () => {
  it('Portal 换票 REQUEST_TIMEOUT 原样透传', async () => {
    const client = {
      request: async () => { throw new Error('REQUEST_TIMEOUT'); },
    } as unknown as HttpClient;

    await expect(TicketExchanger.exchangePortalToken(client)).rejects.toThrow('REQUEST_TIMEOUT');
  });

  it('Portal 换票透传 fetch/解析器已识别的全部瞬态网络错误', async () => {
    const transientErrors = [
      'fetch failed',
      'read ECONNRESET',
      'getaddrinfo EAI_AGAIN xyjw.huas.edu.cn',
      'connect ETIMEDOUT',
      'getaddrinfo ENOTFOUND xyjw.huas.edu.cn',
      'network socket disconnected',
    ];

    for (const message of transientErrors) {
      const client = {
        request: async () => { throw new Error(message); },
      } as unknown as HttpClient;

      await expect(TicketExchanger.exchangePortalToken(client)).rejects.toThrow(message);
    }
  });

  it('CAS execution HTTP 5xx 与 200 维护页都不会返回空 execution', async () => {
    const httpFailure = new AuthEngine({
      request: async () => new Response('unavailable', { status: 503 }),
    } as unknown as HttpClient);
    await expect(httpFailure.getExecution()).rejects.toThrow('CAS_EXECUTION_HTTP_503');

    const maintenance = new AuthEngine({
      request: async () => new Response('<html><body>系统维护，请稍后再试</body></html>', { status: 200 }),
    } as unknown as HttpClient);
    await expect(maintenance.getExecution()).rejects.toThrow('CAS_MAINTENANCE');
  });

  it('CAS 登录阶段 HTTP 5xx 不会被解释为密码错误', async () => {
    const engine = new AuthEngine({
      request: async () => new Response('unavailable', { status: 502 }),
    } as unknown as HttpClient);

    await expect(engine.login('2023001001', 'password', '', 'execution'))
      .rejects.toThrow('CAS_PUBKEY_HTTP_502');
  });
});
