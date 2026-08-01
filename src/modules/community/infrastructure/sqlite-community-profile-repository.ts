/**
 * [INPUT]: 依赖构造注入的 Drizzle db、community_profiles schema 与 Community 仓储端口
 * [OUTPUT]: 对外提供 SQLiteCommunityProfileRepository，批量读取、字段级原子 patch、单条校验与批量列出头像引用
 * [POS]: modules/community/infrastructure 的资料事实 adapter，以 SQLite 短事务返回被替换头像且不覆盖并发字段
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { eq, inArray, isNotNull, like, or } from 'drizzle-orm';
import { schema } from '../../../db';
import type { getDb } from '../../../db';
import type { StoredCommunityProfile } from '../domain/community';
import type {
  CommunityProfilePatch,
  CommunityProfileRepository,
} from '../domain/ports';

export type CommunityDatabase = ReturnType<typeof getDb>;

function normalizeUserIds(userIds: readonly number[]) {
  return Array.from(new Set(userIds.filter((userId) => Number.isInteger(userId) && userId > 0)));
}

function toStoredProfile(row: StoredCommunityProfile): StoredCommunityProfile {
  return {
    userId: row.userId,
    nickname: row.nickname?.trim() || null,
    avatarUrl: row.avatarUrl || null,
  };
}

export class SQLiteCommunityProfileRepository implements CommunityProfileRepository {
  constructor(private readonly db: CommunityDatabase) {}

  async getMany(userIds: readonly number[]): Promise<Map<number, StoredCommunityProfile>> {
    const normalized = normalizeUserIds(userIds);
    if (normalized.length === 0) return new Map();

    const rows = await this.db.select({
      userId: schema.communityProfiles.userId,
      nickname: schema.communityProfiles.nickname,
      avatarUrl: schema.communityProfiles.avatarUrl,
    })
      .from(schema.communityProfiles)
      .where(inArray(schema.communityProfiles.userId, normalized));

    return new Map(rows.map((row) => [row.userId, toStoredProfile(row)]));
  }

  async patch(userId: number, patch: CommunityProfilePatch) {
    const hasNickname = Object.prototype.hasOwnProperty.call(patch, 'nickname');
    const hasAvatar = Object.prototype.hasOwnProperty.call(patch, 'avatarUrl');
    if (!hasNickname && !hasAvatar) throw new Error('Community profile patch must not be empty.');

    const now = new Date();
    return this.db.transaction((transaction) => {
      const previous = hasAvatar
        ? transaction.select({ avatarUrl: schema.communityProfiles.avatarUrl })
          .from(schema.communityProfiles)
          .where(eq(schema.communityProfiles.userId, userId))
          .limit(1)
          .all()[0]
        : undefined;

      transaction.insert(schema.communityProfiles).values({
        userId,
        nickname: hasNickname ? patch.nickname ?? null : null,
        avatarUrl: hasAvatar ? patch.avatarUrl ?? null : null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: schema.communityProfiles.userId,
        set: {
          updatedAt: now,
          ...(hasNickname ? { nickname: patch.nickname ?? null } : {}),
          ...(hasAvatar ? { avatarUrl: patch.avatarUrl ?? null } : {}),
        },
      }).run();

      const current = transaction.select({
        userId: schema.communityProfiles.userId,
        nickname: schema.communityProfiles.nickname,
        avatarUrl: schema.communityProfiles.avatarUrl,
      }).from(schema.communityProfiles)
        .where(eq(schema.communityProfiles.userId, userId))
        .limit(1)
        .all()[0];
      if (!current) throw new Error(`Community profile patch lost userId=${userId}`);

      return {
        profile: toStoredProfile(current),
        replacedAvatarUrl: hasAvatar ? previous?.avatarUrl || null : null,
      };
    });
  }

  async isAvatarPublished(avatarUrl: string): Promise<boolean> {
    const publicPath = avatarUrl.split('?')[0] || '';
    if (!publicPath) return false;
    const rows = await this.db.select({ avatarUrl: schema.communityProfiles.avatarUrl })
      .from(schema.communityProfiles)
      .where(or(
        eq(schema.communityProfiles.avatarUrl, publicPath),
        like(schema.communityProfiles.avatarUrl, `${publicPath}?%`),
      ))
      .limit(1);
    return (rows[0]?.avatarUrl?.split('?')[0] || '') === publicPath;
  }

  async listPublishedAvatarUrls(): Promise<string[]> {
    const rows = await this.db.select({ avatarUrl: schema.communityProfiles.avatarUrl })
      .from(schema.communityProfiles)
      .where(isNotNull(schema.communityProfiles.avatarUrl));
    return rows.flatMap((row) => row.avatarUrl ? [row.avatarUrl] : []);
  }
}
