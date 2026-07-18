/**
 * [INPUT]: 依赖 Hono、academicRefreshRateLimitMiddleware、ClassroomFreeService 与 response.success
 * [OUTPUT]: 默认导出 /api/classrooms 路由，提供楼栋列表与空教室查询
 * [POS]: routes/academic 的空教室 HTTP 适配器，只传递查询条件、用户身份与服务结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { ClassroomFreeService } from '../../services/academic/classroom-free-service';
import { success } from '../../utils/response';

const classrooms = new Hono();

classrooms.use('*', academicRefreshRateLimitMiddleware);

classrooms.get('/buildings', async (c) => {
  const result = await ClassroomFreeService.getBuildings(c.req.query('campusId'), {
    userId: c.get('userId'),
    studentId: c.get('studentId'),
    name: c.get('name'),
  });
  return success(c, result.data, result._meta);
});

classrooms.get('/free', async (c) => {
  const result = await ClassroomFreeService.getFreeRooms(c.req.query(), {
    userId: c.get('userId'),
    studentId: c.get('studentId'),
    name: c.get('name'),
  });
  return success(c, result.data, result._meta);
});

export default classrooms;
