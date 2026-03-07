import { upstream } from './upstream';
import { CacheService } from './cache-service';
import { ScheduleParser } from '../parsers';
import { URLS } from '../core/url-config';
import { config, JW_SJMS_VALUE } from '../config';
import { AppError, ErrorCode } from '../utils/errors';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(rawDate?: string): string {
  const trimmed = (rawDate ?? '').trim();
  const resolved = trimmed || new Date().toISOString().split('T')[0] || '';
  if (!DATE_PATTERN.test(resolved)) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'date 参数格式错误，应为 YYYY-MM-DD');
  }

  const parsed = new Date(`${resolved}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== resolved) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'date 参数无效');
  }
  return resolved;
}

export class ScheduleService {
  static async getSchedule(userId: number, studentId: string, date?: string, forceRefresh = false) {
    const queryDate = normalizeDate(date);
    const cacheKey = `schedule:${studentId}:${queryDate}`;

    if (!forceRefresh) {
      const cached = await CacheService.get(cacheKey);
      if (cached) return { data: cached.data, _meta: cached.meta };
    }

    const data = await upstream(userId, 'jw', async ({ client }) => {
      const params = new URLSearchParams();
      params.append('rq', queryDate);
      params.append('sjmsValue', JW_SJMS_VALUE);

      const res = await client.request(URLS.kbApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: params,
        timeout: config.timeout.business,
      });
      return ScheduleParser.parse(await res.text());
    });

    await CacheService.set(cacheKey, data, config.cacheTtl.schedule, 'jw');
    await CacheService.enforcePrefixLimit(`schedule:${studentId}:`, config.cacheLimit.schedulePerUser);

    return { data, _meta: { cached: false, source: 'jw' } };
  }
}
