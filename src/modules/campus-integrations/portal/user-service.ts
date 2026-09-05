/**
 * [INPUT]: 依赖 OrderedCommit 的并发提交顺序保护，依赖 canonical upstream/CacheService、UserParser、URLS、config、refresh fallback、db/schema 与 drizzle eq
 * [OUTPUT]: 对外提供 UserService.getUserInfo，读取 Portal 用户资料并回写姓名班级缓存
 * [POS]: campus-integrations/portal 的用户资料适配器，负责同意图回源合并，按开始代次串行提交缓存与用户事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { OrderedCommit } from '../../../utils/ordered-commit';
import { upstream } from '../upstream/upstream';
import { CacheService } from '../../cache/cache-service';
import { UserParser } from './parsers/user-parser';
import { URLS } from '../endpoints';
import { config, PORTAL_HEADERS } from '../../../config';
import { fallbackOnRefreshFailure } from '../../../services/infra/refresh-fallback';
import { getDb, schema } from '../../../db';
import { eq } from 'drizzle-orm';

const cacheWrites = new OrderedCommit();

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
        () => cacheWrites.run(cacheKey, () => upstream(userId, 'portal', async ({ client, portalToken }) => {
          const res = await client.request(URLS.userInfo, {
            headers: {
              'X-Id-Token': portalToken!,
              ...PORTAL_HEADERS,
            },
            timeout: config.timeout.business,
          });
          const json = await res.json() as any;
          return UserParser.parse(json);
        }), async (fresh) => {
          if (fresh) {
            await getDb().update(schema.users)
              .set({
                ...(fresh.name ? { name: fresh.name } : {}),
                ...(fresh.className ? { className: fresh.className } : {}),
              })
              .where(eq(schema.users.id, userId));
            await CacheService.set(cacheKey, fresh, config.cacheTtl.user, 'portal');
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
