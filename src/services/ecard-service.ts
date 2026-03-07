import { upstream } from './upstream';
import { CacheService } from './cache-service';
import { ECardParser } from '../parsers';
import { URLS } from '../core/url-config';
import { config } from '../config';
import { fallbackOnRefreshFailure } from './refresh-fallback';

export class ECardService {
  static async getECard(userId: number, studentId: string, forceRefresh = false) {
    const cacheKey = `ecard:${studentId}`;

    if (!forceRefresh) {
      const cached = await CacheService.get(cacheKey);
      if (cached) return { data: cached.data, _meta: cached.meta };
    }

    let data: any;
    try {
      data = await upstream(userId, 'portal', async ({ client, portalToken }) => {
        const res = await client.request(URLS.ecardApi, {
          headers: { 'X-Id-Token': portalToken! },
          timeout: config.timeout.business,
        });
        return ECardParser.parse(await res.json());
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

    if (data) {
      await CacheService.set(cacheKey, data, config.cacheTtl.ecard, 'portal');
    }

    return { data, _meta: { cached: false, source: 'portal' } };
  }
}
