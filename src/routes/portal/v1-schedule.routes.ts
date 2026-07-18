/**
 * [INPUT]: 依赖 Hono、academicRefreshRateLimitMiddleware、ScheduleFacade、共享课表日志适配器与 response.success
 * [OUTPUT]: 默认导出 /api/v1/schedule 路由
 * [POS]: routes/portal 的 Portal 优先课表 HTTP 适配器，只解析参数、记录日志并委托 facade
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { ScheduleFacade } from '../../services/academic/schedule-facade';
import { success } from '../../utils/response';
import { appendScheduleRouteLog } from '../schedule-route-log';

const v1Schedule = new Hono();

v1Schedule.use('*', academicRefreshRateLimitMiddleware);

// Portal schedule (v1)
v1Schedule.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const name = c.get('name');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const forceRefresh = c.req.query('refresh') === 'true';

  const result = await ScheduleFacade.getPortalFirstSchedule({
    userId,
    studentId,
    name,
    startDate,
    endDate,
    forceRefresh,
  });
  appendScheduleRouteLog(c, result, forceRefresh, 'portal');
  return success(c, result.data, result._meta);
});

export default v1Schedule;
