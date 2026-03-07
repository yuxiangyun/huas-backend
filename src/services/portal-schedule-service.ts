import { upstream } from './upstream';
import { CacheService } from './cache-service';
import { PortalScheduleParser } from '../parsers';
import { URLS } from '../core/url-config';
import { config } from '../config';

export class PortalScheduleService {
  static async getSchedule(
    userId: number,
    studentId: string,
    startDate: string,
    endDate: string,
    forceRefresh = false
  ) {
    const cacheKey = `portal-schedule:${studentId}:${startDate}:${endDate}`;

    if (!forceRefresh) {
      const cached = await CacheService.get(cacheKey);
      if (cached) return { data: cached.data, _meta: cached.meta };
    }

    const data = await upstream(userId, 'portal', async ({ client, portalToken }) => {
      const url = new URL(URLS.portalScheduleEvents);
      url.searchParams.append('startDate', startDate);
      url.searchParams.append('endDate', endDate);
      url.searchParams.append('reqType', 'MonthView');
      url.searchParams.append('random_number', Math.random().toString());

      const res = await client.request(url.toString(), {
        headers: { 'X-Id-Token': portalToken! },
        timeout: config.timeout.business,
      });
      return PortalScheduleParser.parse(await res.json(), startDate);
    });

    await CacheService.set(cacheKey, data, config.cacheTtl.schedule, 'portal');

    return { data, _meta: { cached: false, source: 'portal' } };
  }
}
