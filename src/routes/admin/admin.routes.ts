import { Hono } from 'hono';
import { adminBasicAuthMiddleware } from '../../middleware/admin-basic-auth.middleware';
import { success, error } from '../../utils/response';
import { ErrorCode } from '../../utils/errors';
import { AdminDashboardService } from '../../services/admin/dashboard-service';
import { AnnouncementService } from '../../services/content/announcement-service';
import { DiscoverService } from '../../services/discover/discover-service';
import { TreeholeService } from '../../services/treehole/treehole-service';
import { Logger } from '../../utils/logger';

const admin = new Hono();

admin.use('*', adminBasicAuthMiddleware);

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
