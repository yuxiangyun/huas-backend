/**
 * [INPUT]: 依赖 Hono、academicRefreshRateLimitMiddleware、Academic 热策略门面与首选来源校验、共享课表日志及统一错误/响应
 * [OUTPUT]: 默认导出 /api/schedule 路由
 * [POS]: routes/academic 的统一课表 HTTP 适配器，校验可选 preferred_source；Academic 按请求快照编排首选与后台后备来源
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { isPreferredScheduleSource, ScheduleFacade } from '../../modules/academic/schedule';
import { AppError, ErrorCode } from '../../utils/errors';
import { success } from '../../utils/response';
import { appendScheduleRouteLog } from '../schedule-route-log';

const schedule = new Hono();

schedule.use('*', academicRefreshRateLimitMiddleware);

// 用户只提供首次尝试的来源，后续回退由 Academic 编排。
schedule.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const name = c.get('name');
  const date = c.req.query('date');
  const forceRefresh = c.req.query('refresh') === 'true';
  const preferredSource = c.req.query('preferred_source');
  if (preferredSource !== undefined && !isPreferredScheduleSource(preferredSource)) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'preferred_source 仅支持 mobile-jw 或 jw');
  }

  const result = await ScheduleFacade.getSchedule({
    userId,
    studentId,
    name,
    date,
    forceRefresh,
    preferredSource,
  });
  appendScheduleRouteLog(c, result, forceRefresh);
  return success(c, result.data, result._meta);
});

export default schedule;
