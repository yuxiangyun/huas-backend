/**
 * [INPUT]: 依赖真实学校账号、隔离 E2E SQLite、应用路由、JWT/凭证表与只读校园上游
 * [OUTPUT]: 验证登录、旧 JW 恢复、mobile-yxt 单月账单/真实可空电费 DTO 与 epoch 绑定的无 TTL 派生会话持久化
 * [POS]: tests 的唯一真实学校网络入口，所有写操作仅落隔离本服务数据库，不调用学校上游写接口
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { rmSync } from 'node:fs';
import { getDb, schema } from '../src/db';
import { registerRoutes } from '../src/routes';
import { onAppError } from '../src/middleware/error.middleware';
import { config } from '../src/config';
import { ErrorCode } from '../src/utils/errors';

const username = process.env.HUAS_E2E_USERNAME;
const password = process.env.HUAS_E2E_PASSWORD;
const runSilentReauth = process.env.HUAS_E2E_RUN_SILENT_REAUTH === '1';

// Live school systems can be slow/flaky; keep E2E timeout above default 5s.
setDefaultTimeout(20_000);

if (!username || !password) {
  describe('Live E2E: 登录与凭证重新获取（需要真实账号）', () => {
    it('skip when E2E credentials are not provided', () => {
      expect(true).toBe(true);
    });
  });
} else {
  let app: Hono;
  let token = '';
  let userId = 0;

  async function authorizedRequest(path: string): Promise<Response> {
    return app.request(`http://localhost${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  describe('Live E2E: 登录与凭证重新获取（需要真实账号）', () => {
    beforeAll(async () => {
      app = new Hono();
      app.onError(onAppError);
      registerRoutes(app);
    });

    afterAll(() => {
      const root = (globalThis as any).__HUAS_E2E_ROOT__;
      if (root) {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('登录成功并落库凭证', async () => {
      const res = await app.request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const body = await res.json() as any;
      if (body.needCaptcha) {
        throw new Error('CAS 当前要求验证码，无法无交互跑 E2E。请换账号或稍后再试。');
      }

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(typeof body.data?.token).toBe('string');
      token = body.data.token;

      const db = getDb();
      const users = await db.select().from(schema.users).where(eq(schema.users.studentId, username!)).limit(1);
      expect(users.length).toBe(1);
      userId = users[0].id;

      const creds = await db.select().from(schema.credentials).where(eq(schema.credentials.userId, userId));
      const systems = creds.map((c) => c.system);
      expect(systems.includes('cas_tgc')).toBe(true);
      expect(systems.includes('jw_session')).toBe(true);
    });

    it('Self JWT 过期时返回 401（场景 7）', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = await sign({
        userId,
        studentId: username!,
        iat: now - 7200,
        exp: now - 3600,
      }, config.jwtSecret, 'HS256');

      const res = await app.request('http://localhost/api/schedule', {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      const body = await res.json() as any;

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error_code).toBe(ErrorCode.JWT_INVALID);
    });

    it('mobile-yxt 当前月校园卡账单只读返回稳定 DTO，派生会话无本地 TTL', async () => {
      const res = await authorizedRequest('/api/ecard/overview?refresh=true');
      const body = await res.json() as any;
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(typeof body.data?.month).toBe('string');
      expect(Array.isArray(body.data?.transactions)).toBe(true);
      expect(typeof body.data?.totals?.consumptionCents).toBe('number');
      expect(typeof body.data?.partial).toBe('boolean');
      expect(JSON.stringify(body.data)).not.toMatch(/accessToken|refreshToken|JSESSIONID|authorization|\btid\b/i);

      const rows = await getDb().select().from(schema.credentials).where(and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.system, 'derived_session:mobile_yxt'),
      )).limit(1);
      expect(rows).toHaveLength(1);
      expect(rows[0].expiresAt).toBeNull();
    }, { timeout: 30_000 });

    it('mobile-yxt 电费只读保留十进制电量和上游账户状态，关闭明细与未验证缴费', async () => {
      const res = await authorizedRequest('/api/utilities/electricity?refresh=true');
      const body = await res.json() as any;
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(typeof body.data?.roomDisplayName).toBe('string');
      expect(body.data?.priceCentsPerKwh === null || typeof body.data?.priceCentsPerKwh === 'number').toBe(true);
      expect(body.data?.remainingKwh === null || typeof body.data?.remainingKwh === 'string').toBe(true);
      expect(typeof body.data?.accountStatus).toBe('string');
      expect(body.data?.detailsAvailable).toBe(false);
      expect(body.data?.officialPaymentAvailable).toBe(false);
      expect(JSON.stringify(body.data)).not.toMatch(/accessToken|refreshToken|JSESSIONID|authorization|\btid\b/i);
    }, { timeout: 30_000 });

    it('JW 凭证过期后自动刷新并继续成功返回（场景 3）', async () => {
      const db = getDb();
      await db.update(schema.credentials)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(and(
          eq(schema.credentials.userId, userId),
          eq(schema.credentials.system, 'jw_session')
        ));

      const res = await authorizedRequest('/api/schedule?refresh=true');
      const body = await res.json() as any;
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);

      const rows = await db.select().from(schema.credentials).where(and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.system, 'jw_session')
      )).limit(1);
      expect(rows.length).toBe(1);
      expect(rows[0].expiresAt?.getTime() || 0).toBeGreaterThan(Date.now());
    });

    it('运行时 SESSION_EXPIRED 可触发恢复重试（场景 5）', async () => {
      const db = getDb();
      await db.update(schema.credentials)
        .set({
          cookieJar: '{"version":"tough-cookie@5.0.0","storeType":"MemoryCookieStore","rejectPublicSuffixes":true,"enableLooseMode":false,"allowSpecialUseDomain":true,"prefixSecurity":"silent","cookies":[]}',
          expiresAt: new Date(Date.now() + 5 * 60_000),
        })
        .where(and(
          eq(schema.credentials.userId, userId),
          eq(schema.credentials.system, 'jw_session')
        ));

      const res = await authorizedRequest('/api/schedule?refresh=true');
      const body = await res.json() as any;
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    }, { timeout: 20_000, retry: 2 });

    it('可选：TGC 与子凭证同时过期后触发静默重认证（场景 6）', async () => {
      if (!runSilentReauth) {
        expect(true).toBe(true);
        return;
      }

      const db = getDb();
      const expiredAt = new Date(Date.now() - 60_000);

      await db.update(schema.credentials)
        .set({ expiresAt: expiredAt })
        .where(and(
          eq(schema.credentials.userId, userId),
          eq(schema.credentials.system, 'jw_session')
        ));

      await db.update(schema.credentials)
        .set({ expiresAt: expiredAt })
        .where(and(
          eq(schema.credentials.userId, userId),
          eq(schema.credentials.system, 'cas_tgc')
        ));

      const res = await authorizedRequest('/api/schedule?refresh=true');
      const body = await res.json() as any;
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });
}
