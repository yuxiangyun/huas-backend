/**
 * [INPUT]: 依赖 Hono 测试应用、管理路由与测试环境管理员凭据
 * [OUTPUT]: 验证后台 HttpOnly Cookie 会话的建立、保护与撤销
 * [POS]: tests 的后台认证边界回归套件，防止 Basic 凭据重新进入浏览器存储
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { createApplicationComposition } from '../src/composition';

const composition = createApplicationComposition();
afterAll(() => composition.dispose());

function createApp() {
  const app = new Hono();
  composition.app.registerRoutes(app);
  return app;
}

describe('admin session', () => {
  it('creates an HttpOnly session and revokes it on logout', async () => {
    const app = createApp();
    const login = await app.request('http://localhost/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test-admin', password: 'test-admin-password' }),
    });
    expect(login.status).toBe(200);

    const setCookie = login.headers.get('set-cookie') || '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/api/admin');
    const cookie = setCookie.split(';')[0];

    const dashboard = await app.request('http://localhost/api/admin/dashboard', { headers: { Cookie: cookie } });
    expect(dashboard.status).toBe(200);

    const logout = await app.request('http://localhost/api/admin/session', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(logout.status).toBe(200);

    const afterLogout = await app.request('http://localhost/api/admin/dashboard', { headers: { Cookie: cookie } });
    expect(afterLogout.status).toBe(401);
  });

  it('rejects invalid credentials without issuing a cookie', async () => {
    const app = createApp();
    const response = await app.request('http://localhost/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test-admin', password: 'wrong' }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
