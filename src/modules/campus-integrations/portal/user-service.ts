/**
 * [INPUT]: 依赖 canonical upstream/CacheService、UserParser、URLS、config、refresh fallback、db/schema 与 drizzle eq
 * [OUTPUT]: 对外提供 UserService.getUserInfo，读取 Portal 用户资料并回写姓名班级缓存
 * [POS]: campus-integrations/portal 的用户资料适配器，负责同意图回源合并、缓存与用户事实回写
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { upstream } from '../upstream/upstream';
import { CacheService } from '../../cache/cache-service';
import { UserParser } from './parsers/user-parser';
import { URLS } from '../endpoints';
import { config, PORTAL_HEADERS } from '../../../config';
import { fallbackOnRefreshFailure } from '../../../services/infra/refresh-fallback';
import { getDb, schema } from '../../../db';
import { eq } from 'drizzle-orm';

export class UserService {
  static async getUserInfo(userId: number, studentId: string, forceRefresh = false) {
    const cacheKey = `user:${studentId}`;

    if (!forceRefresh) {
      const cached = await CacheService.get(cacheKey);
      if (cached) return { data: cached.data, _meta: cached.meta };
    }

    let data: any;
    try {
      data = await CacheService.runSingleflight(
        cacheKey,
        forceRefresh,
        () => upstream(userId, 'portal', async ({ client, portalToken }) => {
          const res = await client.request(URLS.userInfo, {
            headers: {
              'X-Id-Token': portalToken!,
              ...PORTAL_HEADERS,
            },
            timeout: config.timeout.business,
          });
          const json = await res.json() as any;
          return UserParser.parse(json);
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

    if (data) {
      await getDb().update(schema.users)
        .set({
          ...(data.name ? { name: data.name } : {}),
          ...(data.className ? { className: data.className } : {}),
        })
        .where(eq(schema.users.id, userId));
      await CacheService.set(cacheKey, data, config.cacheTtl.user, 'portal');
    }

    return { data, _meta: { cached: false, source: 'portal' } };
  }
}
