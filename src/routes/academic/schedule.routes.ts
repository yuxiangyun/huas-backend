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
  const requestMeta = result._request;
  appendHttpLogDetail(c, formatHttpLogDetail({
    week: result.data?.week,
    courses: Array.isArray(result.data?.courses) ? result.data.courses.length : undefined,
    cache: requestMeta?.cache,
    refresh: forceRefresh ? true : undefined,
    fallback: requestMeta?.fallback,
    lookup: requestMeta?.lookup && requestMeta.lookup !== 'weekly' ? requestMeta.lookup : undefined,
    promoted: requestMeta?.promotedFrom ? 'legacy' : undefined,
  }));
  return success(c, result.data, result._meta);
});

export default schedule;
