import { Hono } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { ScheduleService } from '../../services/academic/schedule-service';
import { PortalScheduleService } from '../../services/portal/portal-schedule-service';
import { resolveFallbackError } from '../../utils/fallback-error';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../utils/http-log';
import { AppError, ErrorCode } from '../../utils/errors';
import { success, error } from '../../utils/response';

const v1Schedule = new Hono();

function canFallbackToWeeklyJw(startDate: string, endDate: string): boolean {
  const parsedStart = new Date(`${startDate}T00:00:00Z`);
  const parsedEnd = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
    return false;
  }

  const diffDays = Math.floor((parsedEnd.getTime() - parsedStart.getTime()) / 86_400_000);
  if (diffDays !== 6) {
    return false;
  }

  return parsedStart.getUTCDay() === 1 && parsedEnd.getUTCDay() === 0;
}

v1Schedule.use('*', academicRefreshRateLimitMiddleware);

// Portal schedule (v1)
v1Schedule.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const name = c.get('name');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const forceRefresh = c.req.query('refresh') === 'true';

  if (!startDate || !endDate) {
    return error(c, ErrorCode.PARAM_ERROR, 'Missing startDate or endDate parameter', 400);
  }

  let result = await PortalScheduleService.getSchedule(userId, studentId, startDate, endDate, forceRefresh, name).catch(async (error) => {
    if (error instanceof AppError && error.code === ErrorCode.PARAM_ERROR) {
      throw error;
    }

    if (!canFallbackToWeeklyJw(startDate, endDate)) {
      throw error;
    }

    try {
      const jwResult = await ScheduleService.getSchedule(
        userId,
        studentId,
        startDate,
        forceRefresh,
        name,
      );

      return {
        ...jwResult,
        _request: {
          queryDate: startDate,
          weekStartDate: startDate,
          cacheKey: `schedule:${studentId}:${startDate}`,
          cache: forceRefresh ? 'bypass' : 'fallback',
          fallback: 'jw',
          lookup: 'weekly',
        },
      };
    } catch (fallbackError) {
      throw resolveFallbackError({
        primarySource: 'portal',
        fallbackSource: 'jw',
        primaryError: error,
        fallbackError,
        studentId,
      });
    }
  });

  const requestMeta = '_request' in result ? result._request : undefined;
  const promotedFrom = requestMeta && 'promotedFrom' in requestMeta ? requestMeta.promotedFrom : undefined;
  appendHttpLogDetail(c, formatHttpLogDetail({
    week: result.data?.week,
    courses: Array.isArray(result.data?.courses) ? result.data.courses.length : undefined,
    cache: requestMeta?.cache,
    refresh: forceRefresh ? true : undefined,
    fallback: requestMeta?.fallback,
    source: result._meta?.source && result._meta.source !== 'portal' ? result._meta.source : undefined,
    lookup: requestMeta?.lookup && requestMeta.lookup !== 'weekly' ? requestMeta.lookup : undefined,
    promoted: promotedFrom ? 'legacy' : undefined,
  }));
  return success(c, result.data, result._meta);
});

export default v1Schedule;
