import { Hono } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { ScheduleService } from '../../services/academic/schedule-service';
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
  return success(c, result.data, result._meta);
});

export default schedule;
