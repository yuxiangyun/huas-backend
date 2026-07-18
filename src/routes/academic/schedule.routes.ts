/**
 * [INPUT]: 依赖 Hono、academicRefreshRateLimitMiddleware、ScheduleFacade、共享课表日志适配器与 response.success
 * [OUTPUT]: 默认导出 /api/schedule 路由
 * [POS]: routes/academic 的 JW 优先课表 HTTP 适配器，只解析参数、记录日志并委托 facade
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { ScheduleFacade } from '../../services/academic/schedule-facade';
import { success } from '../../utils/response';
import { appendScheduleRouteLog } from '../schedule-route-log';

const schedule = new Hono();

schedule.use('*', academicRefreshRateLimitMiddleware);

// JW schedule (legacy)
schedule.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const name = c.get('name');
  const date = c.req.query('date');
  const forceRefresh = c.req.query('refresh') === 'true';

  const result = await ScheduleFacade.getJwFirstSchedule({
    userId,
    studentId,
    name,
    date,
    forceRefresh,
  });
  appendScheduleRouteLog(c, result, forceRefresh, 'jw');
  return success(c, result.data, result._meta);
});

export default schedule;
