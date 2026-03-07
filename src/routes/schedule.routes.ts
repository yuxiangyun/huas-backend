import { Hono } from 'hono';
import { ScheduleService } from '../services/schedule-service';
import { PortalScheduleService } from '../services/portal-schedule-service';
import { success, error } from '../utils/response';
import { ErrorCode } from '../utils/errors';

const schedule = new Hono();

// JW schedule (legacy)
schedule.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const date = c.req.query('date');
  const forceRefresh = c.req.query('refresh') === 'true';

  const result = await ScheduleService.getSchedule(userId, studentId, date, forceRefresh);
  return success(c, result.data, result._meta);
});

export default schedule;
