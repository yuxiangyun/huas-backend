import { upstream } from './upstream';
import { CacheService } from './cache-service';
import { UserParser } from '../parsers';
import { URLS } from '../core/url-config';
import { config, PORTAL_HEADERS } from '../config';
import { fallbackOnRefreshFailure } from './refresh-fallback';

export class UserService {
  static async getUserInfo(userId: number, studentId: string, forceRefresh = false) {
    const cacheKey = `user:${studentId}`;

    if (!forceRefresh) {
      const cached = await CacheService.get(cacheKey);
      if (cached) return { data: cached.data, _meta: cached.meta };
    }

    let data: any;
    try {
      data = await upstream(userId, 'portal', async ({ client, portalToken }) => {
        const res = await client.request(URLS.userInfo, {
          headers: {
            'X-Id-Token': portalToken!,
            ...PORTAL_HEADERS,
          },
          timeout: config.timeout.business,
        });
        const json = await res.json() as any;
        if (json.code !== 0) throw new Error(json.message);
        return UserParser.parse(json);
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
      await CacheService.set(cacheKey, data, config.cacheTtl.user, 'portal');
    }

    return { data, _meta: { cached: false, source: 'portal' } };
  }
}
