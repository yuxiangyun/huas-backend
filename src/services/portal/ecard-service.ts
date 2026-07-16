/**
 * [INPUT]: 依赖 Portal 一卡通 HTTP/JSON、ECardParser、upstream、CacheService 与刷新失败兜底
 * [OUTPUT]: 对外提供 ECardService.getECard，仅缓存具有明确余额字段的稳定一卡通 DTO
 * [POS]: services/portal 的一卡通读取与缓存边界，不以缺失余额伪造 0 元事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { upstream } from '../infra/upstream';
import { CacheService } from '../infra/cache-service';
import { ECardParser } from '../../parsers';
import { URLS } from '../../core/url-config';
import { config } from '../../config';
import { fallbackOnRefreshFailure } from '../infra/refresh-fallback';

function assertECardResponse(response: Response) {
  if (response.status === 401 || response.status === 403) throw new Error('SESSION_EXPIRED');
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`ECARD_HTTP_${response.status}`);
  }
}

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
        assertECardResponse(res);
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
