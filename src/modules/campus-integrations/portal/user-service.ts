/**
 * [INPUT]: 依赖 OrderedCommit、学校资料规则、SchoolAccess、CacheService、config、refresh fallback、IUserInfo 与 SQLite
 * [OUTPUT]: 对外提供资料读取与缺失补全；原子提交原始上游快照及非空学校资料，响应缺字段保留已有真实值
 * [POS]: campus-integrations/portal 的资料适配器；只将完整原始资料作为普通缓存命中，不完整资料和旧姓名占位继续回源
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
import { AppError, ErrorCode } from '../../../utils/errors';
import {
  hasCompleteSchoolProfile,
  LEGACY_SCHOOL_NAME_PLACEHOLDER,
  normalizeSchoolProfileName,
} from '../../identity/domain/school-profile';

const cacheWrites = new OrderedCommit();

function isUserInfo(value: unknown, studentId: string): value is IUserInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.name === 'string'
    && typeof profile.studentId === 'string'
    && Boolean(profile.studentId.trim())
    && profile.studentId === studentId
    && typeof profile.className === 'string'
    && typeof profile.identity === 'string'
    && typeof profile.organizationCode === 'string';
}

function withExistingUserProfile(userId: number, profile: IUserInfo): IUserInfo {
  const existing = getDb().select({ name: schema.users.name, className: schema.users.className })
    .from(schema.users).where(eq(schema.users.id, userId)).get();
  return {
    ...profile,
    name: normalizeSchoolProfileName(profile.name) || normalizeSchoolProfileName(existing?.name),
    className: profile.className.trim() || existing?.className?.trim() || '',
  };
}

async function fillMissingUserProfile(userId: number, profile: IUserInfo): Promise<void> {
  const name = normalizeSchoolProfileName(profile.name);
  const className = profile.className?.trim();
  if (!name && !className) return;

  const missingName = name
    ? sql`${schema.users.name} IS NULL OR trim(${schema.users.name}) = '' OR trim(${schema.users.name}) = ${LEGACY_SCHOOL_NAME_PLACEHOLDER}`
    : undefined;
  const missingClassName = className
    ? sql`${schema.users.className} IS NULL OR trim(${schema.users.className}) = ''`
    : undefined;

  await getDb().update(schema.users).set({
    ...(name ? {
      name: sql<string>`CASE WHEN ${schema.users.name} IS NULL OR trim(${schema.users.name}) = '' OR trim(${schema.users.name}) = ${LEGACY_SCHOOL_NAME_PLACEHOLDER} THEN ${name} ELSE ${schema.users.name} END`,
    } : {}),
    ...(className ? {
      className: sql<string>`CASE WHEN ${schema.users.className} IS NULL OR trim(${schema.users.className}) = '' THEN ${className} ELSE ${schema.users.className} END`,
    } : {}),
  }).where(and(eq(schema.users.id, userId), or(missingName, missingClassName)));
}

function commitUserProfile(userId: number, cacheKey: string, profile: IUserInfo): void {
  const name = normalizeSchoolProfileName(profile.name);
  const className = profile.className?.trim();
  const cacheWrite = CacheService.prepareSet(cacheKey, profile, config.cacheTtl.user, 'portal');

  getDb().transaction((tx) => {
    if (name || className) {
      tx.update(schema.users).set({
        ...(name ? { name } : {}),
        ...(className ? { className } : {}),
      }).where(eq(schema.users.id, userId)).run();
    }
    cacheWrite.write(tx);
  });
}

export class UserService {
  static async completeMissingUserInfo(userId: number, studentId: string, hasCompleteLocalProfile: boolean): Promise<void> {
    if (hasCompleteLocalProfile) {
      const cached = await CacheService.get<unknown>(`user:${studentId}`);
      if (!cached || (isUserInfo(cached.data, studentId) && hasCompleteSchoolProfile(cached.data))) return;
    }
    // 本地或最近原始上游资料不完整时，永久缓存不能拦住下一次登录补全。
    await this.getUserInfo(userId, studentId, true);
  }

  static async getUserInfo(userId: number, studentId: string, forceRefresh = false) {
    const cacheKey = `user:${studentId}`;

    if (!forceRefresh) {
      const cached = await CacheService.get<unknown>(cacheKey);
      if (cached && isUserInfo(cached.data, studentId)) {
        await fillMissingUserProfile(userId, cached.data);
        if (hasCompleteSchoolProfile(cached.data)) {
          return { data: withExistingUserProfile(userId, cached.data), _meta: cached.meta };
        }
      }
    }

    let data: IUserInfo | null;
    try {
      data = await CacheService.runSingleflight(
        cacheKey,
        forceRefresh,
        () => cacheWrites.run(cacheKey, async () => {
          const fresh = await schoolAccess.execute(userId, { name: 'portal.profile', input: {} });
          if (fresh.studentId !== studentId) {
            throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '学校用户资料与当前账号不匹配，请稍后重试');
          }
          return fresh;
        }, async (fresh) => {
          if (fresh) {
            commitUserProfile(userId, cacheKey, fresh);
          }
        }),
      );
    } catch (error) {
      const fallback = await fallbackOnRefreshFailure<IUserInfo>({
        forceRefresh,
        cacheKey,
        error,
        source: 'portal',
        studentId,
        discardCached: (profile) => !isUserInfo(profile, studentId),
      });
      if (fallback) return { ...fallback, data: withExistingUserProfile(userId, fallback.data) };
      throw error;
    }

    return { data: data ? withExistingUserProfile(userId, data) : null, _meta: { cached: false, source: 'portal' } };
  }
}
