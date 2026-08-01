/**
 * [INPUT]: 依赖 Social 摘要路由工厂与 Hono 测试请求
 * [OUTPUT]: 覆盖私信/通知读端口的单请求并行聚合与稳定响应字段
 * [POS]: tests 的跨 Social HTTP 聚合回归，确保减少请求数不改变两个领域的事实边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createSocialSummaryRoutes } from '../src/routes/social-summary.routes';

describe('Social unread summary routes', () => {
  test('aggregates both readers in one request', async () => {
    const calls: string[] = [];
    const routes = createSocialSummaryRoutes({
      async countMessagingUnread(userId) {
        calls.push(`messaging:${userId}`);
        return 3;
      },
      async summarizeNotifications(userId) {
        calls.push(`notifications:${userId}`);
        return { unreadCount: 4, total: 11 };
      },
    });
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('userId', 17);
      await next();
    });
    app.route('/social', routes);

    const response = await app.request('http://localhost/social/unread-summary');

    expect(response.status).toBe(200);
    expect((await response.json() as any).data).toEqual({
      messagingUnreadCount: 3,
      notificationUnreadCount: 4,
      notificationTotal: 11,
    });
    expect(calls.toSorted()).toEqual(['messaging:17', 'notifications:17']);
  });
});
