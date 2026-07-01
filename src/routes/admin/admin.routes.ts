/**
 * [INPUT]: 依赖 adminBasicAuthMiddleware、dashboard/content/discover/treehole/log 服务、ugcComplianceState 与响应工具
 * [OUTPUT]: 对外默认导出 admin Hono 路由，提供 /api/admin 管理面接口与 UGC 合规热开关
 * [POS]: routes/admin 的管理 HTTP 适配器，统一 Basic Auth、管理参数解析、运行态开关、错误包装与操作日志
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { adminBasicAuthMiddleware } from '../../middleware/admin-basic-auth.middleware';
import { success, error } from '../../utils/response';
import { ErrorCode } from '../../utils/errors';
import { AdminDashboardService } from '../../services/admin/dashboard-service';
import { AnnouncementService } from '../../services/content/announcement-service';
import { DiscoverService } from '../../services/discover/discover-service';
import { TerminalLogService } from '../../services/admin/terminal-log-service';
import { TreeholeService } from '../../services/treehole/treehole-service';
import { Logger } from '../../utils/logger';
import { ugcComplianceState } from '../../runtime/ugc-compliance-state';

const admin = new Hono();

admin.use('*', adminBasicAuthMiddleware);

admin.get('/compliance/ugc', (c) => {
  return success(c, ugcComplianceState.status());
});

admin.put('/compliance/ugc', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
  }

  const mode = typeof body?.mode === 'string' ? body.mode : undefined;
  if (mode !== undefined && mode !== 'normal' && mode !== 'compliance') {
    return error(c, ErrorCode.PARAM_ERROR, 'mode 必须是 normal 或 compliance', 400);
  }
  if (mode === undefined) {
    return error(c, ErrorCode.PARAM_ERROR, 'mode 必须提供', 400);
  }
  if (body?.discoverMockText !== undefined && typeof body.discoverMockText !== 'string') {
    return error(c, ErrorCode.PARAM_ERROR, 'discoverMockText 必须是纯文本字符串', 400);
  }
  if (body?.treeholeMockText !== undefined && typeof body.treeholeMockText !== 'string') {
    return error(c, ErrorCode.PARAM_ERROR, 'treeholeMockText 必须是纯文本字符串', 400);
  }

  const state = ugcComplianceState.configure({
    mode,
    discoverMockText: body?.discoverMockText,
    treeholeMockText: body?.treeholeMockText,
  }, c.get('adminUser') || 'admin');
  Logger.operation(
    'Admin',
    `${state.mode === 'compliance' ? '启用' : '关闭'} UGC 合规模式`,
    c.get('adminUser'),
    '管理员',
    `discoverMockTextLength=${state.discoverMockText.length}; treeholeMockTextLength=${state.treeholeMockText.length}; stateFile=${state.stateFile}`
  );
  return success(c, state);
});

admin.get('/dashboard', async (c) => {
  try {
    const data = await AdminDashboardService.getDashboard(c.req.query());
    return success(c, data);
  } catch (e: any) {
    return error(c, ErrorCode.INTERNAL_ERROR, e?.message || '获取管理面板数据失败', 500);
  }
});

admin.get('/announcements', async (c) => {
  try {
    const data = await AnnouncementService.listAdmin();
    return success(c, data);
  } catch (e: any) {
    return error(c, ErrorCode.INTERNAL_ERROR, e?.message || '获取公告列表失败', 500);
  }
});

admin.get('/logs', async (c) => {
  const limitParam = c.req.query('limit');
  const parsedLimit = limitParam ? Number(limitParam) : null;

  if (limitParam && (typeof parsedLimit !== 'number' || !Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
    return error(c, ErrorCode.PARAM_ERROR, '日志条数不合法', 400);
  }

  try {
    const data = await TerminalLogService.list({
      limit: parsedLimit ?? undefined,
      keyword: c.req.query('keyword'),
    });
    return success(c, data);
  } catch (e: any) {
    return error(c, ErrorCode.INTERNAL_ERROR, e?.message || '获取终端日志失败', 500);
  }
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
  } catch (e: any) {
    return error(c, ErrorCode.PARAM_ERROR, e?.message || '创建公告失败', 400);
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
    if (!updated) {
      return error(c, ErrorCode.PARAM_ERROR, '公告不存在', 404);
    }
    Logger.operation('Admin', `更新公告 ${id}`, c.get('adminUser'), '管理员');
    return success(c, updated);
  } catch (e: any) {
    return error(c, ErrorCode.PARAM_ERROR, e?.message || '更新公告失败', 400);
  }
});

admin.delete('/announcements/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const removed = await AnnouncementService.remove(id);
    if (!removed) {
      return error(c, ErrorCode.PARAM_ERROR, '公告不存在', 404);
    }
    Logger.operation('Admin', `删除公告 ${id}`, c.get('adminUser'), '管理员');
    return success(c, { id });
  } catch (e: any) {
    return error(c, ErrorCode.PARAM_ERROR, e?.message || '删除公告失败', 400);
  }
});

admin.delete('/discover/posts/:id', async (c) => {
  const postId = Number(c.req.param('id'));
  if (!Number.isInteger(postId) || postId <= 0) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  try {
    const removed = await DiscoverService.adminDeletePost(postId);
    if (!removed) {
      return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
    }
    Logger.operation('Admin', `删除 Discover 帖子 #${removed.id}`, c.get('adminUser'), '管理员');
    return success(c, { id: removed.id });
  } catch (e: any) {
    return error(c, ErrorCode.INTERNAL_ERROR, e?.message || '删除帖子失败', 500);
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
    const data = await TreeholeService.adminListPosts({
      page,
      pageSize,
      keyword: query.keyword,
    });
    return success(c, data);
  } catch (e: any) {
    return error(c, ErrorCode.INTERNAL_ERROR, e?.message || '获取树洞列表失败', 500);
  }
});

admin.get('/treehole/posts/:id/comments', async (c) => {
  const postId = Number(c.req.param('id'));
  const query = c.req.query();
  const page = query.page ? Number(query.page) : undefined;
  const pageSize = query.pageSize ? Number(query.pageSize) : undefined;

  if (!Number.isInteger(postId) || postId <= 0) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }
  if ((page !== undefined && (!Number.isInteger(page) || page <= 0))
    || (pageSize !== undefined && (!Number.isInteger(pageSize) || pageSize <= 0))) {
    return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
  }

  try {
    const data = await TreeholeService.adminListComments(postId, { page, pageSize });
    if (!data) {
      return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
    }
    return success(c, data);
  } catch (e: any) {
    return error(c, ErrorCode.INTERNAL_ERROR, e?.message || '获取评论列表失败', 500);
  }
});

admin.delete('/treehole/posts/:id', async (c) => {
  const postId = Number(c.req.param('id'));
  if (!Number.isInteger(postId) || postId <= 0) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  try {
    const removed = await TreeholeService.adminDeletePost(postId);
    if (!removed) {
      return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
    }
    Logger.operation('Admin', `删除 Treehole 帖子 #${removed.id}`, c.get('adminUser'), '管理员');
    return success(c, { id: removed.id });
  } catch (e: any) {
    return error(c, ErrorCode.INTERNAL_ERROR, e?.message || '删除帖子失败', 500);
  }
});

admin.delete('/treehole/comments/:id', async (c) => {
  const commentId = Number(c.req.param('id'));
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return error(c, ErrorCode.PARAM_ERROR, '评论 ID 不合法', 400);
  }

  try {
    const removed = await TreeholeService.adminDeleteComment(commentId);
    if (!removed) {
      return error(c, ErrorCode.PARAM_ERROR, '评论不存在', 404);
    }
    Logger.operation(
      'Admin',
      `删除 Treehole 评论 #${removed.id}`,
      c.get('adminUser'),
      '管理员',
      `postId=${removed.postId}`
    );
    return success(c, removed);
  } catch (e: any) {
    return error(c, ErrorCode.INTERNAL_ERROR, e?.message || '删除评论失败', 500);
  }
});

export default admin;
