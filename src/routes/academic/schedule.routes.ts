/**
 * [INPUT]: 依赖 Hono、academicRefreshRateLimitMiddleware、ScheduleFacade、http-log 与 response.success
 * [OUTPUT]: 默认导出 /api/schedule 路由
 * [POS]: routes/academic 的 JW 优先课表 HTTP 适配器，只解析参数、记录日志并委托 facade
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono, type Context } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { ScheduleFacade, type ScheduleFacadeResult } from '../../services/academic/schedule-facade';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../utils/http-log';
import { success } from '../../utils/response';

const schedule = new Hono();

function appendScheduleLog(c: Context, result: ScheduleFacadeResult, forceRefresh: boolean) {
  const requestMeta = result._request;
  appendHttpLogDetail(c, formatHttpLogDetail({
    week: result.data?.week,
    courses: Array.isArray(result.data?.courses) ? result.data.courses.length : undefined,
    cache: requestMeta.cache,
    refresh: forceRefresh ? true : undefined,
    fallback: requestMeta.fallback,
    source: result._meta.source && result._meta.source !== 'jw' ? result._meta.source : undefined,
    lookup: requestMeta.lookup && requestMeta.lookup !== 'weekly' ? requestMeta.lookup : undefined,
    promoted: requestMeta.promotedFrom ? 'legacy' : undefined,
  }));
}

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
  appendScheduleLog(c, result, forceRefresh);
  return success(c, result.data, result._meta);
});

export default schedule;
