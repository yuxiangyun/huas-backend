import { Hono } from 'hono';
import { PortalScheduleService } from '../services/portal-schedule-service';
import { success, error } from '../utils/response';
import { ErrorCode } from '../utils/errors';

const v1Schedule = new Hono();

// Portal schedule (v1)
v1Schedule.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const forceRefresh = c.req.query('refresh') === 'true';

  if (!startDate || !endDate) {
    return error(c, ErrorCode.PARAM_ERROR, 'Missing startDate or endDate parameter', 400);
  }

  const result = await PortalScheduleService.getSchedule(userId, studentId, startDate, endDate, forceRefresh);
  return success(c, result.data, result._meta);
});

export default v1Schedule;
