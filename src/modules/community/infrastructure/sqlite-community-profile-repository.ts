/**
 * [INPUT]: 依赖构造注入的 Drizzle db、community_profiles schema 与 Community 仓储端口
 * [OUTPUT]: 对外提供 SQLiteCommunityProfileRepository，批量读写昵称/头像并校验已发布媒体
 * [POS]: modules/community/infrastructure 的资料事实 adapter，只访问 community_profiles，不 JOIN users
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { eq, inArray, like, or } from 'drizzle-orm';
import { schema } from '../../../db';
import type { getDb } from '../../../db';
import type { StoredCommunityProfile } from '../domain/community';
import type { CommunityProfileRepository } from '../domain/ports';

export type CommunityDatabase = ReturnType<typeof getDb>;

function normalizeUserIds(userIds: readonly number[]) {
  return Array.from(new Set(userIds.filter((userId) => Number.isInteger(userId) && userId > 0)));
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

    return new Map(rows.map((row) => [row.userId, {
      userId: row.userId,
      nickname: row.nickname?.trim() || null,
      avatarUrl: row.avatarUrl || null,
    }]));
  }

  async save(profile: StoredCommunityProfile): Promise<void> {
    const now = new Date();
    await this.db.insert(schema.communityProfiles).values({
      userId: profile.userId,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: schema.communityProfiles.userId,
      set: {
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        updatedAt: now,
      },
    });
  }

  async isAvatarPublished(publicPath: string): Promise<boolean> {
    const rows = await this.db.select({ avatarUrl: schema.communityProfiles.avatarUrl })
      .from(schema.communityProfiles)
      .where(or(
        eq(schema.communityProfiles.avatarUrl, publicPath),
        like(schema.communityProfiles.avatarUrl, `${publicPath}?%`),
      ))
      .limit(1);
    return (rows[0]?.avatarUrl?.split('?')[0] || '') === publicPath;
  }
}
