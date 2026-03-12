import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { initDatabase, getDb, schema } from '../src/db';
import { upstream } from '../src/services/infra/upstream';

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
