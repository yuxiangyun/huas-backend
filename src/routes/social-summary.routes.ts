/**
 * [INPUT]: 依赖 Messaging 未读计数与 Notifications 未读/总量摘要窄端口、Hono 认证上下文和统一响应
 * [OUTPUT]: 对外提供 createSocialSummaryRoutes，一次并行聚合私信与互动未读摘要
 * [POS]: routes 的跨 Social 只读 HTTP 聚合器，减少客户端轮询请求但不合并两个领域的事实模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { success } from '../utils/response';

export interface SocialSummaryReaders {
  countMessagingUnread(userId: number): Promise<number>;
  summarizeNotifications(userId: number): Promise<{ unreadCount: number; total: number }>;
}

export function createSocialSummaryRoutes(readers: SocialSummaryReaders) {
  const routes = new Hono();

  routes.get('/unread-summary', async (c) => {
    const userId = c.get('userId');
    const [messagingUnreadCount, notificationSummary] = await Promise.all([
      readers.countMessagingUnread(userId),
      readers.summarizeNotifications(userId),
    ]);
    return success(c, {
      messagingUnreadCount,
      notificationUnreadCount: notificationSummary.unreadCount,
      notificationTotal: notificationSummary.total,
    });
  });

  return routes;
}
