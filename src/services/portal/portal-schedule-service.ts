import { upstream } from '../infra/upstream';
import { CacheService } from '../infra/cache-service';
import { PortalScheduleParser } from '../../parsers';
import { URLS } from '../../core/url-config';
import { config } from '../../config';
import { AppError, ErrorCode } from '../../utils/errors';
import { fallbackOnRefreshFailure } from '../infra/refresh-fallback';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 62;

function normalizeDate(rawDate: string, fieldName: 'startDate' | 'endDate'): string {
  const trimmed = (rawDate || '').trim();
  if (!DATE_PATTERN.test(trimmed)) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${fieldName} 参数格式错误，应为 YYYY-MM-DD`);
  }

  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${fieldName} 参数无效`);
  }
  return trimmed;
}

export class PortalScheduleService {
  static async getSchedule(
    userId: number,
    studentId: string,
    startDate: string,
    endDate: string,
    forceRefresh = false,
    name?: string
  ) {
    const normalizedStartDate = normalizeDate(startDate, 'startDate');
    const normalizedEndDate = normalizeDate(endDate, 'endDate');

    const startTime = new Date(`${normalizedStartDate}T00:00:00Z`).getTime();
    const endTime = new Date(`${normalizedEndDate}T00:00:00Z`).getTime();
    if (endTime < startTime) {
      throw new AppError(ErrorCode.PARAM_ERROR, 'endDate 不能早于 startDate');
    }

    const rangeDays = Math.floor((endTime - startTime) / 86_400_000);
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new AppError(ErrorCode.PARAM_ERROR, `日期区间不能超过 ${MAX_RANGE_DAYS} 天`);
    }

    const cacheKey = `portal-schedule:${studentId}:${normalizedStartDate}:${normalizedEndDate}`;

    if (!forceRefresh) {
      const cached = await CacheService.get(cacheKey);
      if (cached) return { data: cached.data, _meta: cached.meta };
    }

    let data: any;
    try {
      data = await upstream(userId, 'portal', async ({ client, portalToken }) => {
        const url = new URL(URLS.portalScheduleEvents);
        url.searchParams.append('startDate', normalizedStartDate);
        url.searchParams.append('endDate', normalizedEndDate);
        url.searchParams.append('reqType', 'MonthView');
        url.searchParams.append('random_number', Math.random().toString());

        const res = await client.request(url.toString(), {
          headers: { 'X-Id-Token': portalToken! },
          timeout: config.timeout.business,
        });
        return PortalScheduleParser.parse(await res.json(), normalizedStartDate, { studentId, name });
      });
    } catch (error) {
      const fallback = await fallbackOnRefreshFailure({
        forceRefresh,
        cacheKey,
        error,
        source: 'portal',
        studentId,
      });
      if (fallback) return fallback;
      throw error;
    }

    await CacheService.set(cacheKey, data, config.cacheTtl.schedule, 'portal');
    await CacheService.enforcePrefixLimit(`portal-schedule:${studentId}:`, config.cacheLimit.portalSchedulePerUser);

    return { data, _meta: { cached: false, source: 'portal' } };
  }
}
