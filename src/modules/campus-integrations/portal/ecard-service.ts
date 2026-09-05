/**
 * [INPUT]: 依赖 OrderedCommit 的并发提交顺序保护，依赖 Portal 一卡通 HTTP/JSON、ECardParser、canonical upstream/CacheService 与刷新失败兜底
 * [OUTPUT]: 对外提供 ECardService.getECard，仅缓存具有明确余额字段的稳定一卡通 DTO
 * [POS]: campus-integrations/portal 的一卡通资料适配器，保留既有缓存、同意图回源合并、代次提交缓存与 stale fallback 语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { OrderedCommit } from '../../../utils/ordered-commit';
import { upstream } from '../upstream/upstream';
import { CacheService } from '../../cache/cache-service';
import { ECardParser } from './parsers/ecard-parser';
import { URLS } from '../endpoints';
import { config } from '../../../config';
import { fallbackOnRefreshFailure } from '../../../services/infra/refresh-fallback';

function assertECardResponse(response: Response) {
  if (response.status === 401 || response.status === 403) throw new Error('SESSION_EXPIRED');
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`ECARD_HTTP_${response.status}`);
  }
}

const cacheWrites = new OrderedCommit();

export class ECardService {
  static async getECard(userId: number, studentId: string, forceRefresh = false) {
    const cacheKey = `ecard:${studentId}`;

    if (!forceRefresh) {
      const cached = await CacheService.get(cacheKey);
      if (cached) return { data: cached.data, _meta: cached.meta };
    }

    let data: any;
    try {
      data = await CacheService.runSingleflight(
        cacheKey,
        forceRefresh,
        () => cacheWrites.run(cacheKey, () => upstream(userId, 'portal', async ({ client, portalToken }) => {
          const res = await client.request(URLS.ecardApi, {
            headers: { 'X-Id-Token': portalToken! },
            timeout: config.timeout.business,
          });
          assertECardResponse(res);
          return ECardParser.parse(await res.json());
        }), async (fresh) => {
          if (fresh) {
            await CacheService.set(cacheKey, fresh, config.cacheTtl.ecard, 'portal');
          }
        }),
      );
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

    return { data, _meta: { cached: false, source: 'portal' } };
  }
}
