/**
 * [INPUT]: 依赖 Hono、注入的 MessagingApplicationService/策略、共享 multipart 请求上限、私有媒体响应、统一响应/HTTP 日志与 Logger
 * [OUTPUT]: 对外提供 createMessagingRoutes(service, policy)，按 multipart 线序映射会话翻页/增量、三态历史、受限上传与私有媒体
 * [POS]: modules/messaging/http 的认证后协议 adapter，以 afterMessageId 高水位轮询并在 multipart 解析前统一执行 413 门禁
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { ErrorCode } from '../../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../../utils/http-log';
import { Logger } from '../../../utils/logger';
import { privateMediaResponse } from '../../../utils/private-media-response';
import { isBodyLimitError, requestBodyLimit } from '../../../utils/request-body-limit';
import { error, success } from '../../../utils/response';
import type { MessagingApplicationService } from '../application/messaging-application-service';
import { messagingRequestMaxBytes, type MessagingPolicy } from '../domain/messaging';

type MessagingHttpService = Pick<
  MessagingApplicationService,
  | 'send'
  | 'getConversationTarget'
  | 'listConversations'
  | 'listConversationChanges'
  | 'listMessages'
  | 'countUnread'
  | 'markRead'
  | 'getMedia'
>;

export function createMessagingRoutes(
  service: MessagingHttpService,
  policy: MessagingPolicy,
) {
  const routes = new Hono();

  routes.get('/conversations', async (c) => {
    const page = parseOptionalPositiveInt(c.req.query('page'));
    const pageSize = parseOptionalPositiveInt(c.req.query('pageSize'));
    if (page === null || pageSize === null) {
      return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
    }
    return success(c, await service.listConversations(c.get('userId'), { page, pageSize }));
  });

  routes.get('/conversations/changes', async (c) => {
    const afterValue = c.req.query('afterMessageId');
    const afterMessageId = afterValue === undefined ? 0 : Number(afterValue);
    const limit = parseOptionalPositiveInt(c.req.query('limit'));
    if (!Number.isInteger(afterMessageId) || afterMessageId < 0 || limit === null) {
      return error(c, ErrorCode.PARAM_ERROR, '会话增量参数不合法', 400);
    }
    return success(c, await service.listConversationChanges(c.get('userId'), {
      afterMessageId,
      limit,
    }));
  });

  routes.get('/users/:userId/conversation', async (c) => {
    const targetUserId = parsePositiveId(c.req.param('userId'));
    if (!targetUserId) return error(c, ErrorCode.PARAM_ERROR, '目标用户 ID 不合法', 400);
    const data = await service.getConversationTarget(c.get('userId'), targetUserId);
    return data
      ? success(c, data)
      : error(c, ErrorCode.PARAM_ERROR, '目标用户不存在', 404);
  });

  routes.get('/conversations/:id/messages', async (c) => {
    const conversationId = parsePositiveId(c.req.param('id'));
    const beforeMessageId = parseOptionalPositiveInt(c.req.query('beforeMessageId'));
    const afterMessageId = parseOptionalPositiveInt(c.req.query('afterMessageId'));
    const limit = parseOptionalPositiveInt(c.req.query('limit'));
    if (!conversationId || beforeMessageId === null || afterMessageId === null || limit === null) {
      return error(c, ErrorCode.PARAM_ERROR, '会话或消息分页参数不合法', 400);
    }
    if (beforeMessageId !== undefined && afterMessageId !== undefined) {
      return error(c, ErrorCode.PARAM_ERROR, 'beforeMessageId 和 afterMessageId 不能同时提交', 400);
    }
    const data = await service.listMessages(c.get('userId'), conversationId, {
      beforeMessageId,
      afterMessageId,
      limit,
    });
    return data
      ? success(c, data)
      : error(c, ErrorCode.PARAM_ERROR, '会话不存在或无权访问', 404);
  });

  routes.get('/unread-count', async (c) => {
    return success(c, { unreadCount: await service.countUnread(c.get('userId')) });
  });

  routes.post(
    '/users/:userId/messages',
    requestBodyLimit({
      maxSize: messagingRequestMaxBytes(policy),
      tooLargeMessage: '私信上传请求体过大',
    }),
    async (c) => {
      const recipientUserId = parsePositiveId(c.req.param('userId'));
      if (!recipientUserId) return error(c, ErrorCode.PARAM_ERROR, '接收者 ID 不合法', 400);
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch (cause) {
        if (isBodyLimitError(cause)) throw cause;
        return error(c, ErrorCode.PARAM_ERROR, '请求必须是 multipart/form-data', 400);
      }
      const textEntry = form.get('text');
      if (textEntry !== null && typeof textEntry !== 'string') {
        return error(c, ErrorCode.PARAM_ERROR, '消息文字不合法', 400);
      }
      const imageEntries: unknown[] = [];
      form.forEach((value, field) => {
        if (field === 'images' || field === 'images[]') imageEntries.push(value);
      });
      if (imageEntries.some((entry) => !(entry instanceof File) || entry.size <= 0)) {
        return error(c, ErrorCode.PARAM_ERROR, '图片文件不合法', 400);
      }
      const images = imageEntries as File[];
      const clientMessageId = c.req.header('Idempotency-Key');

      appendHttpLogDetail(c, formatHttpLogDetail({
        recipientUserId,
        textCodePoints: typeof textEntry === 'string' ? Array.from(textEntry).length : 0,
        images: images.length,
        originalBytes: images.reduce((total, image) => total + image.size, 0),
      }));
      const data = await service.send({
        senderUserId: c.get('userId'),
        recipientUserId,
        clientMessageId: clientMessageId ?? '',
        text: typeof textEntry === 'string' ? textEntry : null,
        images,
      });
      Logger.operation(
        'Messaging',
        `发送消息 #${data.id}`,
        c.get('studentId'),
        c.get('name'),
        `conversationId=${data.conversationId}; recipientUserId=${recipientUserId}; images=${data.images.length}`,
      );
      return success(c, data);
    },
  );

  routes.put('/conversations/:id/read', async (c) => {
    const conversationId = parsePositiveId(c.req.param('id'));
    if (!conversationId) return error(c, ErrorCode.PARAM_ERROR, '会话 ID 不合法', 400);

    let throughMessageId: number | undefined;
    if ((c.req.header('content-type') ?? '').includes('application/json')) {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效 JSON', 400);
      }
      const value = (body as { throughMessageId?: unknown } | null)?.throughMessageId;
      if (value !== undefined) {
        throughMessageId = Number(value);
        if (!Number.isInteger(throughMessageId) || throughMessageId <= 0) {
          return error(c, ErrorCode.PARAM_ERROR, '消息 ID 不合法', 400);
        }
      }
    }

    const data = await service.markRead(c.get('userId'), conversationId, throughMessageId);
    if (!data) return error(c, ErrorCode.PARAM_ERROR, '会话或消息不存在', 404);
    Logger.operation(
      'Messaging',
      `更新会话 #${conversationId} 阅读游标`,
      c.get('studentId'),
      c.get('name'),
      `lastReadMessageId=${data.lastReadMessageId ?? 0}; unreadCount=${data.unreadCount}`,
    );
    return success(c, data);
  });

  routes.get('/media/:batchKey/:fileName', async (c) => {
    const storageKey = `${c.req.param('batchKey')}/${c.req.param('fileName')}`;
    const file = await service.getMedia(c.get('userId'), storageKey);
    if (!file) return error(c, ErrorCode.PARAM_ERROR, '私信图片不存在或无权访问', 404);
    return privateMediaResponse(file);
  });

  return routes;
}

function parsePositiveId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalPositiveInt(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
