/**
 * [INPUT]: 依赖 Drizzle/SQLite cache 表、FreshnessPolicy、cache envelope、CacheMeta、北京时间、统一 Logger 与可选访问观察器
 * [OUTPUT]: 对外提供 SqliteCacheStore，以 created_at 表达数据写入时间、updated_at 维护 LRU，损坏值按快照条件清理，触达和淘汰故障不改变已选定的数据结果
 * [POS]: cache/infrastructure 的本地持久化适配器，是 cache 表时间语义、领域元数据、旁路 LRU 与防并发误删令牌的唯一翻译边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import type { CacheMeta } from '../../../types';
import { beijingIsoString } from '../../../utils/time';
import { Logger } from '../../../utils/logger';
import { createCacheEnvelope, decodeCacheEnvelope } from '../domain/cache-envelope';
import { expiresAtFor, type FreshnessPolicy } from '../domain/freshness-policy';

export interface CacheReadOptions {
  touch?: boolean;
  allowExpired?: boolean;
}

export interface CacheReadResult<T> {
  data: T;
  meta: CacheMeta;
  // 仅供同一缓存边界执行条件失效，禁止投影到 API DTO 或日志。
  versionToken: string;
}

export class SqliteCacheStore {
  constructor(private readonly observeAccess: (outcome: 'hit' | 'miss') => void = () => {}) {}

  private recordAccess(outcome: 'hit' | 'miss'): void {
    try {
      this.observeAccess(outcome);
    } catch {
      // 可观测性是旁路，不能把缓存命中或未命中升级成业务失败。
    }
  }

  async get<T>(key: string, options?: CacheReadOptions): Promise<CacheReadResult<T> | null> {
    const db = getDb();
    const rows = await db.select()
      .from(schema.cache)
      .where(eq(schema.cache.key, key))
      .limit(1);
    if (rows.length === 0) {
      this.recordAccess('miss');
      return null;
    }

    const entry = rows[0];
    const expired = Boolean(entry.expiresAt && entry.expiresAt.getTime() < Date.now());
    if (expired && !options?.allowExpired) {
      this.recordAccess('miss');
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(entry.data);
    } catch {
      Logger.warn('CacheService', '缓存数据损坏，按未命中处理', key);
      try {
        // 读取之后可能已有同键刷新提交；只清理本次读到的损坏快照。
        await this.invalidateIfVersion(key, entry.data);
      } catch {
        Logger.warn('CacheService', '损坏缓存清理失败，按未命中处理', key);
      }
      this.recordAccess('miss');
      return null;
    }

    const decoded = decodeCacheEnvelope<T>(parsed);
    if (decoded.status === 'unsupported') {
      Logger.warn('CacheService', '缓存版本无法识别，按未命中处理', `schema_version=${String(decoded.schemaVersion)}`, key);
      this.recordAccess('miss');
      return null;
    }
    if (decoded.status === 'invalid') {
      Logger.warn('CacheService', '缓存 envelope 损坏，按未命中处理', key);
      this.recordAccess('miss');
      return null;
    }

    const touchedAt = new Date();
    if (options?.touch) {
      try {
        await db.update(schema.cache)
          .set({ updatedAt: touchedAt })
          .where(and(eq(schema.cache.key, key), eq(schema.cache.data, entry.data)));
      } catch {
        // LRU 是维护信息，写失败不能把已经校验的缓存命中变成业务失败。
        Logger.warn('CacheService', '缓存触达维护失败，保留命中结果', key);
      }
    }

    this.recordAccess('hit');
    return {
      data: decoded.data,
      meta: {
        cached: true,
        cache_time: beijingIsoString(entry.createdAt),
        // updated_at 是客户端展示的数据新鲜度，不得被 LRU touch 伪造成重新回源。
        updated_at: beijingIsoString(entry.createdAt),
        expires_at: entry.expiresAt ? beijingIsoString(entry.expiresAt) : undefined,
        source: entry.source || undefined,
        stale: expired || undefined,
      },
      versionToken: entry.data,
    };
  }

  async set(key: string, data: unknown, policy: FreshnessPolicy, source?: string): Promise<void> {
    const db = getDb();
    const now = new Date();
    const expiresAt = expiresAtFor(policy, now);
    const jsonData = JSON.stringify(createCacheEnvelope(data));

    await db.insert(schema.cache).values({
      key,
      data: jsonData,
      source,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    }).onConflictDoUpdate({
      target: schema.cache.key,
      set: { data: jsonData, source, createdAt: now, updatedAt: now, expiresAt },
    });
  }

  async invalidate(key: string): Promise<void> {
    const db = getDb();
    await db.delete(schema.cache).where(eq(schema.cache.key, key));
  }

  async promoteIfAbsent(sourceKey: string, targetKey: string, versionToken: string): Promise<void> {
    // 单条语句只提升曾读到的原始快照；保留数据时间且绝不覆盖并发写入的周缓存。
    await getDb().run(sql`
      INSERT INTO cache (key, data, source, created_at, updated_at, expires_at)
      SELECT ${targetKey}, data, source, created_at, updated_at, expires_at
      FROM cache WHERE key = ${sourceKey} AND data = ${versionToken}
      ON CONFLICT (key) DO NOTHING
    `);
  }

  async invalidateIfVersion(key: string, versionToken: string): Promise<boolean> {
    const db = getDb();
    const removed = await db.delete(schema.cache)
      .where(and(eq(schema.cache.key, key), eq(schema.cache.data, versionToken)))
      .returning({ id: schema.cache.id });
    return removed.length > 0;
  }

  async cleanupExpired(): Promise<void> {
    const db = getDb();
    const now = Date.now();
    await db.run(sql`DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at < ${now}`);
  }

  async enforcePrefixLimit(prefix: string, maxEntries: number): Promise<void> {
    if (maxEntries <= 0) return;
    try {
      const db = getDb();
      const likePattern = `${prefix}%`;
      await db.run(sql`
        DELETE FROM cache
        WHERE id IN (
          SELECT id
          FROM cache
          WHERE key LIKE ${likePattern}
          ORDER BY updated_at DESC, id DESC
          LIMIT -1 OFFSET ${maxEntries}
        )
      `);
    } catch {
      // 调用者已写入新鲜数据；淘汰失败单独记录，后续写入仍会再次执行限额维护。
      Logger.warn('CacheService', '缓存限额维护失败，保留数据结果', prefix);
    }
  }
}
