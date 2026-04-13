import { Hono } from 'hono';
import { verifyCalendarSignature } from '../../auth/calendar-signature';
import { config } from '../../config';
import {
  buildEmptyWeeklyScheduleIcs,
  buildWeeklyScheduleIcs,
  getCalendarSubscriptionContentHeaders,
  getCurrentWeekSchedule,
  resolveCalendarSubscriptionUser,
} from '../../services/calendar/calendar-subscription-service';
import { ErrorCode } from '../../utils/errors';
import { error } from '../../utils/response';

const calendarPublic = new Hono();

calendarPublic.get('/schedule.ics', async (c) => {
  const studentId = c.req.query('studentId')?.trim();
  const sig = c.req.query('sig')?.trim();
  if (!studentId || !sig) {
    return error(c, ErrorCode.PARAM_ERROR, 'Missing studentId or sig parameter', 400);
  }
  if (!config.calendar.secret) {
    return error(c, ErrorCode.INTERNAL_ERROR, 'CALENDAR_SECRET 未配置', 500);
  }

  if (!verifyCalendarSignature(studentId, sig)) {
    return error(c, ErrorCode.JWT_INVALID, 'Invalid calendar signature', 401);
  }

  const user = await resolveCalendarSubscriptionUser(studentId);
  if (!user) {
    return error(c, ErrorCode.JWT_INVALID, 'User no longer exists, please login again', 401);
  }

  try {
    const { range, result } = await getCurrentWeekSchedule(user);
    const ics = buildWeeklyScheduleIcs({
      studentId: user.studentId,
      name: user.name,
      weekStart: range.startDate,
      courses: Array.isArray(result.data?.courses) ? result.data.courses : [],
    });
    return new Response(ics, {
      headers: getCalendarSubscriptionContentHeaders(),
    });
  } catch (err: any) {
    if (err?.message === 'SCHEDULE_NOT_AVAILABLE') {
      const ics = buildEmptyWeeklyScheduleIcs({
        studentId: user.studentId,
        name: user.name,
      });
      return new Response(ics, {
        headers: getCalendarSubscriptionContentHeaders(),
      });
    }
    throw err;
  }
});

export default calendarPublic;
