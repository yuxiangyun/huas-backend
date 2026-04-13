import { Hono } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { ScheduleService } from '../../services/academic/schedule-service';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../utils/http-log';
import { success } from '../../utils/response';

const schedule = new Hono();

schedule.use('*', academicRefreshRateLimitMiddleware);

// JW schedule (legacy)
schedule.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const name = c.get('name');
  const date = c.req.query('date');
  const forceRefresh = c.req.query('refresh') === 'true';

  const result = await ScheduleService.getSchedule(userId, studentId, date, forceRefresh, name);
  appendHttpLogDetail(c, formatHttpLogDetail({
    date: result._request?.queryDate,
    weekStart: result._request?.weekStartDate,
    cacheKey: result._request?.cacheKey,
    refresh: forceRefresh,
    cache: result._request?.cache,
    lookup: result._request?.lookup,
    fallback: result._request?.fallback,
    promotedFrom: result._request?.promotedFrom,
  }));
  return success(c, result.data, result._meta);
});

export default schedule;
