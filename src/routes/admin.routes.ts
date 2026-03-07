import { Hono } from 'hono';
import { adminBasicAuthMiddleware } from '../middleware/admin-basic-auth.middleware';
import { success, error } from '../utils/response';
import { ErrorCode } from '../utils/errors';
import { AdminDashboardService } from '../services/admin-dashboard-service';
import { AnnouncementService } from '../services/announcement-service';

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
    return success(c, { id });
  } catch (e: any) {
    return error(c, ErrorCode.PARAM_ERROR, e?.message || '删除公告失败', 400);
  }
});

export default admin;
