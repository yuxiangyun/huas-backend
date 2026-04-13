import { Hono } from 'hono';
import { generateCalendarSignature } from '../../auth/calendar-signature';
import { config } from '../../config';
import { buildCalendarSubscriptionUrl } from '../../services/calendar/calendar-subscription-service';
import { ErrorCode } from '../../utils/errors';
import { error, success } from '../../utils/response';

const calendarApi = new Hono();

function resolveCalendarBaseUrl(): string {
  return config.calendar.baseUrl.replace(/\/+$/, '');
}

calendarApi.get('/link', async (c) => {
  const studentId = c.get('studentId');
  const baseUrl = resolveCalendarBaseUrl();
  if (!baseUrl) {
    return error(c, ErrorCode.INTERNAL_ERROR, 'CALENDAR_BASE_URL 未配置', 500);
  }
  if (!config.calendar.secret) {
    return error(c, ErrorCode.INTERNAL_ERROR, 'CALENDAR_SECRET 未配置', 500);
  }

  const sig = generateCalendarSignature(studentId);
  const url = buildCalendarSubscriptionUrl(baseUrl, studentId, sig);

  return success(c, { url, studentId, sig });
});

export default calendarApi;
