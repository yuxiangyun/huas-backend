/**
 * [INPUT]: 依赖 Hono、注入的 NotificationApplicationService 与统一响应工具
 * [OUTPUT]: 对外提供 createNotificationRoutes(service)，暴露普通列表、ID 增量轮询、未读计数和单条幂等已读协议
 * [POS]: modules/notifications/http 的认证后协议 adapter，明确分离 offset 翻页与无漏项增量读取且不提供全部已读
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { ErrorCode } from '../../../utils/errors';
import { error, success } from '../../../utils/response';
import type { NotificationApplicationService } from '../application/notification-application-service';

type NotificationHttpService = Pick<
  NotificationApplicationService,
  'list' | 'listChanges' | 'countUnread' | 'markRead'
>;

function parseOptionalPositiveInt(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function createNotificationRoutes(service: NotificationHttpService) {
  const routes = new Hono();

  routes.get('/', async (c) => {
    const page = parseOptionalPositiveInt(c.req.query('page'));
    const pageSize = parseOptionalPositiveInt(c.req.query('pageSize'));
    if (page === null || pageSize === null) {
      return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
    }
    return success(c, await service.list(c.get('userId'), { page, pageSize }));
  });

  routes.get('/unread-count', async (c) => {
    return success(c, { unreadCount: await service.countUnread(c.get('userId')) });
  });

  routes.get('/changes', async (c) => {
    const afterValue = c.req.query('afterNotificationId');
    const limit = parseOptionalPositiveInt(c.req.query('limit'));
    const afterNotificationId = afterValue === undefined ? 0 : Number(afterValue);
    if (!Number.isInteger(afterNotificationId) || afterNotificationId < 0 || limit === null) {
      return error(c, ErrorCode.PARAM_ERROR, '通知增量参数不合法', 400);
    }
    return success(c, await service.listChanges(c.get('userId'), {
      afterNotificationId,
      limit,
    }));
  });

  routes.put('/:id/read', async (c) => {
    const notificationId = parseOptionalPositiveInt(c.req.param('id'));
    if (!notificationId) {
      return error(c, ErrorCode.PARAM_ERROR, '通知 ID 不合法', 400);
    }
    const marked = await service.markRead(c.get('userId'), notificationId);
    return marked
      ? success(c, { id: notificationId, read: true })
      : error(c, ErrorCode.PARAM_ERROR, '通知不存在', 404);
  });

  return routes;
}
