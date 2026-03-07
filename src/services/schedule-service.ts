import { upstream } from './upstream';
import { CacheService } from './cache-service';
import { ScheduleParser } from '../parsers';
import { URLS } from '../core/url-config';
import { config, JW_SJMS_VALUE } from '../config';

export class ScheduleService {
  static async getSchedule(userId: number, studentId: string, date?: string, forceRefresh = false) {
    const queryDate = date || new Date().toISOString().split('T')[0] || '';
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

    return { data, _meta: { cached: false, source: 'jw' } };
  }
}
