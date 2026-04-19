import { Hono } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { ScheduleService } from '../../services/academic/schedule-service';
import { PortalScheduleService } from '../../services/portal/portal-schedule-service';
import { resolveFallbackError } from '../../utils/fallback-error';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../utils/http-log';
import { AppError, ErrorCode } from '../../utils/errors';
import { success } from '../../utils/response';
import { beijingDate } from '../../utils/time';

const schedule = new Hono();

function getWeekRange(date?: string) {
  const resolvedDate = (date || '').trim() || beijingDate();
  const parsed = new Date(`${resolvedDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== resolvedDate) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'date 参数无效');
  }

  const monday = new Date(parsed);
  const diffToMonday = (parsed.getUTCDay() + 6) % 7;
  monday.setUTCDate(parsed.getUTCDate() - diffToMonday);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    startDate: monday.toISOString().slice(0, 10),
    endDate: sunday.toISOString().slice(0, 10),
  };
}

schedule.use('*', academicRefreshRateLimitMiddleware);

// JW schedule (legacy)
schedule.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const name = c.get('name');
  const date = c.req.query('date');
  const forceRefresh = c.req.query('refresh') === 'true';

  let result = await ScheduleService.getSchedule(userId, studentId, date, forceRefresh, name).catch(async (error) => {
    if (error instanceof AppError && error.code === ErrorCode.PARAM_ERROR) {
      throw error;
    }

    try {
      const { startDate, endDate } = getWeekRange(date);
      const portalResult = await PortalScheduleService.getSchedule(
        userId,
        studentId,
        startDate,
        endDate,
        forceRefresh,
        name,
      );

      return {
        ...portalResult,
        _request: {
          queryDate: date || startDate,
          weekStartDate: startDate,
          cacheKey: `portal-schedule:${studentId}:${startDate}:${endDate}`,
          cache: forceRefresh ? 'bypass' : 'fallback',
          fallback: 'portal',
          lookup: 'weekly',
        },
      };
    } catch (fallbackError) {
      throw resolveFallbackError({
        primarySource: 'jw',
        fallbackSource: 'portal',
        primaryError: error,
        fallbackError,
        studentId,
      });
    }
  });
  const requestMeta = result._request;
  const promotedFrom = requestMeta && 'promotedFrom' in requestMeta ? requestMeta.promotedFrom : undefined;
  appendHttpLogDetail(c, formatHttpLogDetail({
    week: result.data?.week,
    courses: Array.isArray(result.data?.courses) ? result.data.courses.length : undefined,
    cache: requestMeta?.cache,
    refresh: forceRefresh ? true : undefined,
    fallback: requestMeta?.fallback,
    source: result._meta?.source && result._meta.source !== 'jw' ? result._meta.source : undefined,
    lookup: requestMeta?.lookup && requestMeta.lookup !== 'weekly' ? requestMeta.lookup : undefined,
    promoted: promotedFrom ? 'legacy' : undefined,
  }));
  return success(c, result.data, result._meta);
});

export default schedule;
