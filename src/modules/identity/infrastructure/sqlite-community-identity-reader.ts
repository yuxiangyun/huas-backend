/**
 * [INPUT]: 依赖构造注入的 Drizzle db、users schema 与 CommunityIdentityReader 契约
 * [OUTPUT]: 对外提供 SQLiteCommunityIdentityReader，批量读取存在用户的 id/className
 * [POS]: identity/infrastructure 的 Community 防腐适配器，独占 users 表且不泄露学号、姓名或凭证
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { inArray } from 'drizzle-orm';
import { schema } from '../../../db';
import type { getDb } from '../../../db';
import type {
  CommunityIdentity,
  CommunityIdentityReader,
} from '../domain/community-identity-reader';

type IdentityDatabase = ReturnType<typeof getDb>;

function normalizeUserIds(userIds: readonly number[]) {
  return Array.from(new Set(userIds.filter((userId) => Number.isInteger(userId) && userId > 0)));
}

export class SQLiteCommunityIdentityReader implements CommunityIdentityReader {
  constructor(private readonly db: IdentityDatabase) {}

  async getMany(userIds: readonly number[]): Promise<Map<number, CommunityIdentity>> {
    const normalized = normalizeUserIds(userIds);
    if (normalized.length === 0) return new Map();

    const rows = await this.db.select({
      id: schema.users.id,
      className: schema.users.className,
    })
      .from(schema.users)
      .where(inArray(schema.users.id, normalized));

    return new Map(rows.map((row) => [row.id, {
      id: row.id,
      className: row.className?.trim() || null,
    }]));
  }
}
