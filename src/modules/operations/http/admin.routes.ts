/**
 * [INPUT]: 依赖注入的 Operations application 服务、会话边界、Academic 策略公开门面、自有 infrastructure 与统一响应/审计日志
 * [OUTPUT]: 对外提供 createAdminRoutes(dependencies)，生成会话、dashboard、内容、社区、增量/三态私信只读与课表策略路由
 * [POS]: operations/http 的注入式管理面协议适配器，三类私信读取均写入不含正文、文件名或用户隐私的审计日志
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { isScheduleSourceMode, ScheduleSourcePolicy } from '../../academic/schedule';
import { ErrorCode } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';
import { error, success } from '../../../utils/response';
import type { AdminDashboardApplicationService } from '../application/admin-dashboard-service';
import type { CommunityAdminApplicationService } from '../application/community-admin-service';
import type { MessagingAdminApplicationService } from '../application/messaging-admin-service';
import { AnalyticsService } from '../infrastructure/analytics-service';
import { AnnouncementService } from '../infrastructure/announcement-service';
import { TerminalLogService } from '../infrastructure/terminal-log-service';
import {
  adminSessionMiddleware,
  createAdminSession,
  currentAdminSession,
  revokeAdminSession,
} from './admin-session.middleware';

export interface AdminRouteDependencies {
  dashboard: Pick<AdminDashboardApplicationService, 'getDashboard'>;
  communityAdmin: Pick<
    CommunityAdminApplicationService,
    | 'deleteDiscoverPost'
    | 'listTreeholePosts'
    | 'listTreeholeComments'
    | 'deleteTreeholePost'
    | 'deleteTreeholeComment'
  >;
  messagingAdmin: Pick<
    MessagingAdminApplicationService,
    'listConversations' | 'listConversationChanges' | 'listMessages' | 'getMedia'
  >;
}

export function createAdminRoutes(dependencies: AdminRouteDependencies) {
  const admin = new Hono();

  admin.post('/session', async (c) => {
    let body: { username?: unknown; password?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return error(c, ErrorCode.PARAM_ERROR, '请输入管理员账号和密码', 400);
    }
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const session = createAdminSession(c, username, password);
    if (!session) return error(c, ErrorCode.JWT_INVALID, '管理员账号或密码错误', 401);
    Logger.operation('Admin', '建立后台会话', username, '管理员');
    return success(c, session);
  });

  admin.use('*', adminSessionMiddleware);

  admin.get('/session', (c) => {
    const session = currentAdminSession(c);
    return session ? success(c, session) : error(c, ErrorCode.JWT_INVALID, '后台会话已失效', 401);
  });

  admin.delete('/session', (c) => {
    const username = c.get('adminUser') || 'admin';
    revokeAdminSession(c);
    Logger.operation('Admin', '退出后台会话', username, '管理员');
    return success(c, { revoked: true });
  });

  admin.get('/academic/schedule-source-policy', async (c) => {
    return success(c, await ScheduleSourcePolicy.status());
  });

  admin.put('/academic/schedule-source-policy', async (c) => {
    let body: { mode?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
    }
    if (!isScheduleSourceMode(body?.mode)) {
      return error(c, ErrorCode.PARAM_ERROR, 'mode 必须是 jw-first 或 portal-first', 400);
    }

    const actor = c.get('adminUser') || 'admin';
    const previous = await ScheduleSourcePolicy.status();
    try {
      const current = await ScheduleSourcePolicy.configure(body.mode, actor);
      Logger.operation(
        'Admin',
        '切换课表来源策略',
        actor,
        '管理员',
        `previous=${previous.mode}; current=${current.mode}`,
      );
      return success(c, current);
    } catch (cause: any) {
      Logger.error('SchedulePolicy', '课表来源策略写入失败', cause);
      return error(c, ErrorCode.INTERNAL_ERROR, cause?.message || '课表来源策略写入失败', 500);
    }
  });

  admin.get('/dashboard', async (c) => {
    try {
      return success(c, await dependencies.dashboard.getDashboard(c.req.query()));
    } catch (cause: any) {
      return error(c, ErrorCode.INTERNAL_ERROR, cause?.message || '获取管理面板数据失败', 500);
    }
  });

  admin.get('/analytics/overview', async (c) => {
    const days = Number(c.req.query('days') || 30);
    if (![7, 30, 90].includes(days)) return error(c, ErrorCode.PARAM_ERROR, 'days 仅支持 7、30、90', 400);
    try {
      return success(c, await AnalyticsService.getOverview(days));
    } catch (cause: any) {
      return error(c, ErrorCode.INTERNAL_ERROR, cause?.message || '获取分析数据失败', 500);
    }
  });

  admin.get('/announcements', async (c) => {
    try {
      return success(c, await AnnouncementService.listAdmin());
    } catch (cause: any) {
      return error(c, ErrorCode.INTERNAL_ERROR, cause?.message || '获取公告列表失败', 500);
    }
  });

  admin.get('/logs', async (c) => {
    const limitParam = c.req.query('limit');
    const parsedLimit = limitParam ? Number(limitParam) : null;
    if (limitParam && (!Number.isInteger(parsedLimit) || Number(parsedLimit) <= 0)) {
      return error(c, ErrorCode.PARAM_ERROR, '日志条数不合法', 400);
    }
    try {
      return success(c, await TerminalLogService.list({
        limit: parsedLimit ?? undefined,
        keyword: c.req.query('keyword'),
      }));
    } catch (cause: any) {
      return error(c, ErrorCode.INTERNAL_ERROR, cause?.message || '获取终端日志失败', 500);
    }
  });

  admin.get('/messaging/conversations', async (c) => {
    const page = c.req.query('page') ? Number(c.req.query('page')) : undefined;
    const pageSize = c.req.query('pageSize') ? Number(c.req.query('pageSize')) : undefined;
    if ((page !== undefined && (!Number.isInteger(page) || page <= 0))
      || (pageSize !== undefined && (!Number.isInteger(pageSize) || pageSize <= 0))) {
      return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
    }
    const data = await dependencies.messagingAdmin.listConversations({ page, pageSize });
    Logger.operation('AdminMessagingAudit', 'read_conversation_list', c.get('adminUser'), '管理员');
    return success(c, data);
  });

  admin.get('/messaging/conversations/changes', async (c) => {
    const afterValue = c.req.query('afterMessageId');
    const afterMessageId = afterValue === undefined ? 0 : Number(afterValue);
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
    if (!Number.isInteger(afterMessageId) || afterMessageId < 0
      || (limit !== undefined && (!Number.isInteger(limit) || limit <= 0))) {
      return error(c, ErrorCode.PARAM_ERROR, '会话增量参数不合法', 400);
    }
    const data = await dependencies.messagingAdmin.listConversationChanges({
      afterMessageId,
      limit,
    });
    Logger.operation('AdminMessagingAudit', 'read_conversation_changes', c.get('adminUser'), '管理员');
    return success(c, data);
  });

  admin.get('/messaging/conversations/:id/messages', async (c) => {
    const conversationId = Number(c.req.param('id'));
    const beforeValue = c.req.query('beforeMessageId');
    const afterValue = c.req.query('afterMessageId');
    const beforeMessageId = beforeValue === undefined ? undefined : Number(beforeValue);
    const afterMessageId = afterValue === undefined ? undefined : Number(afterValue);
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return error(c, ErrorCode.PARAM_ERROR, '会话 ID 不合法', 400);
    }
    if ((beforeMessageId !== undefined && (!Number.isInteger(beforeMessageId) || beforeMessageId <= 0))
      || (afterMessageId !== undefined && (!Number.isInteger(afterMessageId) || afterMessageId <= 0))
      || (limit !== undefined && (!Number.isInteger(limit) || limit <= 0))) {
      return error(c, ErrorCode.PARAM_ERROR, '消息分页参数不合法', 400);
    }
    if (beforeMessageId !== undefined && afterMessageId !== undefined) {
      return error(c, ErrorCode.PARAM_ERROR, 'beforeMessageId 和 afterMessageId 不能同时提交', 400);
    }
    const data = await dependencies.messagingAdmin.listMessages(conversationId, {
      beforeMessageId,
      afterMessageId,
      limit,
    });
    if (!data) return error(c, ErrorCode.PARAM_ERROR, '会话不存在', 404);
    Logger.operation(
      'AdminMessagingAudit',
      'read_conversation_messages',
      c.get('adminUser'),
      '管理员',
      `conversationId=${conversationId}`,
    );
    return success(c, data);
  });

  admin.get('/messaging/media/:batchKey/:fileName', async (c) => {
    const batchKey = c.req.param('batchKey').trim();
    const fileName = c.req.param('fileName').trim();
    if (!batchKey || !fileName) return error(c, ErrorCode.PARAM_ERROR, '媒体标识不合法', 400);
    const storageKey = `${batchKey}/${fileName}`;
    const media = await dependencies.messagingAdmin.getMedia(storageKey);
    if (!media) return error(c, ErrorCode.PARAM_ERROR, '媒体不存在', 404);
    Logger.operation(
      'AdminMessagingAudit',
      'read_message_media',
      c.get('adminUser'),
      '管理员',
      `conversationId=${media.conversationId}; storageKey=${storageKey}`,
    );
    return new Response(media.data, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': media.data.type || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });

  admin.post('/announcements', async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
    }
    try {
      const created = await AnnouncementService.create(body);
      Logger.operation('Admin', `新增公告 ${created.id}`, c.get('adminUser'), '管理员');
      return success(c, created);
    } catch (cause: any) {
      return error(c, ErrorCode.PARAM_ERROR, cause?.message || '创建公告失败', 400);
    }
  });

  admin.put('/announcements/:id', async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
    }
    const id = c.req.param('id');
    try {
      const updated = await AnnouncementService.update(id, body);
      if (!updated) return error(c, ErrorCode.PARAM_ERROR, '公告不存在', 404);
      Logger.operation('Admin', `更新公告 ${id}`, c.get('adminUser'), '管理员');
      return success(c, updated);
    } catch (cause: any) {
      return error(c, ErrorCode.PARAM_ERROR, cause?.message || '更新公告失败', 400);
    }
  });

  admin.delete('/announcements/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const removed = await AnnouncementService.remove(id);
      if (!removed) return error(c, ErrorCode.PARAM_ERROR, '公告不存在', 404);
      Logger.operation('Admin', `删除公告 ${id}`, c.get('adminUser'), '管理员');
      return success(c, { id });
    } catch (cause: any) {
      return error(c, ErrorCode.PARAM_ERROR, cause?.message || '删除公告失败', 400);
    }
  });

  admin.delete('/discover/posts/:id', async (c) => {
    const postId = Number(c.req.param('id'));
    if (!Number.isInteger(postId) || postId <= 0) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    try {
      const removed = await dependencies.communityAdmin.deleteDiscoverPost(postId);
      if (!removed) return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
      Logger.operation('Admin', `删除 Discover 帖子 #${removed.id}`, c.get('adminUser'), '管理员');
      return success(c, { id: removed.id });
    } catch (cause: any) {
      return error(c, ErrorCode.INTERNAL_ERROR, cause?.message || '删除帖子失败', 500);
    }
  });

  admin.get('/treehole/posts', async (c) => {
    const query = c.req.query();
    const page = query.page ? Number(query.page) : undefined;
    const pageSize = query.pageSize ? Number(query.pageSize) : undefined;
    if ((page !== undefined && (!Number.isInteger(page) || page <= 0))
      || (pageSize !== undefined && (!Number.isInteger(pageSize) || pageSize <= 0))) {
      return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
    }
    try {
      return success(c, await dependencies.communityAdmin.listTreeholePosts({
        page, pageSize, keyword: query.keyword,
      }));
    } catch (cause: any) {
      return error(c, ErrorCode.INTERNAL_ERROR, cause?.message || '获取树洞列表失败', 500);
    }
  });

  admin.get('/treehole/posts/:id/comments', async (c) => {
    const postId = Number(c.req.param('id'));
    const query = c.req.query();
    const page = query.page ? Number(query.page) : undefined;
    const pageSize = query.pageSize ? Number(query.pageSize) : undefined;
    if (!Number.isInteger(postId) || postId <= 0) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    if ((page !== undefined && (!Number.isInteger(page) || page <= 0))
      || (pageSize !== undefined && (!Number.isInteger(pageSize) || pageSize <= 0))) {
      return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
    }
    try {
      const data = await dependencies.communityAdmin.listTreeholeComments(postId, { page, pageSize });
      return data ? success(c, data) : error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
    } catch (cause: any) {
      return error(c, ErrorCode.INTERNAL_ERROR, cause?.message || '获取评论列表失败', 500);
    }
  });

  admin.delete('/treehole/posts/:id', async (c) => {
    const postId = Number(c.req.param('id'));
    if (!Number.isInteger(postId) || postId <= 0) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    try {
      const removed = await dependencies.communityAdmin.deleteTreeholePost(postId);
      if (!removed) return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
      Logger.operation('Admin', `删除 Treehole 帖子 #${removed.id}`, c.get('adminUser'), '管理员');
      return success(c, { id: removed.id });
    } catch (cause: any) {
      return error(c, ErrorCode.INTERNAL_ERROR, cause?.message || '删除帖子失败', 500);
    }
  });

  admin.delete('/treehole/comments/:id', async (c) => {
    const commentId = Number(c.req.param('id'));
    if (!Number.isInteger(commentId) || commentId <= 0) return error(c, ErrorCode.PARAM_ERROR, '评论 ID 不合法', 400);
    try {
      const removed = await dependencies.communityAdmin.deleteTreeholeComment(commentId);
      if (!removed) return error(c, ErrorCode.PARAM_ERROR, '评论不存在', 404);
      Logger.operation('Admin', `删除 Treehole 评论 #${removed.id}`, c.get('adminUser'), '管理员', `postId=${removed.postId}`);
      return success(c, removed);
    } catch (cause: any) {
      return error(c, ErrorCode.INTERNAL_ERROR, cause?.message || '删除评论失败', 500);
    }
  });

  return admin;
}

export default createAdminRoutes;
