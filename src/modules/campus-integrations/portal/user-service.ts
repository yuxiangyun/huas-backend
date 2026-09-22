/**
 * [INPUT]: 依赖 OrderedCommit 的并发提交顺序保护，依赖 SchoolAccess 资料操作、CacheService、config、refresh fallback、IUserInfo、db/schema 与 drizzle 查询表达式
 * [OUTPUT]: 对外提供 UserService.getUserInfo，读取 Portal 用户资料，并使缓存与 users 姓名班级事实收敛
 * [POS]: campus-integrations/portal 的用户资料适配器；缓存命中补空字段，回源成功按开始代次提交最新资料
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { OrderedCommit } from '../../../utils/ordered-commit';
import { schoolAccess } from '../school-access/school-access';
import { CacheService } from '../../cache/cache-service';
import { config } from '../../../config';
import { fallbackOnRefreshFailure } from '../../../services/infra/refresh-fallback';
import { getDb, schema } from '../../../db';
import type { IUserInfo } from '../../../types';
import { and, eq, or, sql } from 'drizzle-orm';

const cacheWrites = new OrderedCommit();

async function fillMissingUserProfile(userId: number, profile: IUserInfo): Promise<void> {
  const name = profile.name?.trim();
  const className = profile.className?.trim();
  if (!name && !className) return;

  const missingName = name
    ? sql`${schema.users.name} IS NULL OR trim(${schema.users.name}) = ''`
    : undefined;
  const missingClassName = className
    ? sql`${schema.users.className} IS NULL OR trim(${schema.users.className}) = ''`
    : undefined;

  await getDb().update(schema.users).set({
    ...(name ? {
      name: sql<string>`CASE WHEN ${schema.users.name} IS NULL OR trim(${schema.users.name}) = '' THEN ${name} ELSE ${schema.users.name} END`,
    } : {}),
    ...(className ? {
      className: sql<string>`CASE WHEN ${schema.users.className} IS NULL OR trim(${schema.users.className}) = '' THEN ${className} ELSE ${schema.users.className} END`,
    } : {}),
  }).where(and(eq(schema.users.id, userId), or(missingName, missingClassName)));
}

async function replaceUserProfile(userId: number, profile: IUserInfo): Promise<void> {
  const name = profile.name?.trim();
  const className = profile.className?.trim();
  if (!name && !className) return;

  await getDb().update(schema.users).set({
    ...(name ? { name } : {}),
    ...(className ? { className } : {}),
  }).where(eq(schema.users.id, userId));
}

export class UserService {
  static async getUserInfo(userId: number, studentId: string, forceRefresh = false) {
    const cacheKey = `user:${studentId}`;

    if (!forceRefresh) {
      const cached = await CacheService.get<IUserInfo>(cacheKey);
      if (cached) {
        await fillMissingUserProfile(userId, cached.data);
        return { data: cached.data, _meta: cached.meta };
      }
    }

    let data: any;
    try {
      data = await CacheService.runSingleflight(
        cacheKey,
        forceRefresh,
        () => cacheWrites.run(cacheKey, () => schoolAccess.execute(userId, { name: 'portal.profile', input: {} }), async (fresh) => {
          if (fresh) {
            await replaceUserProfile(userId, fresh);
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
