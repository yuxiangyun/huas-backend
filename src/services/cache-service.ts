import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import type { CacheMeta } from '../types';
import { beijingIsoString } from '../utils/time';
import { Logger } from '../utils/logger';

export class CacheService {
  static async get<T>(key: string, options?: { touch?: boolean; allowExpired?: boolean }): Promise<{ data: T; meta: CacheMeta } | null> {
    const db = getDb();
    const rows = await db.select()
      .from(schema.cache)
      .where(eq(schema.cache.key, key))
      .limit(1);

    if (rows.length === 0) return null;

    const entry = rows[0];
    const expired = Boolean(entry.expiresAt && entry.expiresAt.getTime() < Date.now());
    if (expired && !options?.allowExpired) {
      return null;
    }

    let parsedData: T;
    try {
      parsedData = JSON.parse(entry.data) as T;
    } catch {
      Logger.warn('CacheService', '缓存数据损坏，已自动清理', key);
      await this.invalidate(key);
      return null;
    }

    const touchedAt = new Date();
    if (options?.touch) {
      await db.update(schema.cache)
        .set({ updatedAt: touchedAt })
        .where(eq(schema.cache.key, key));
    }

    return {
      data: parsedData,
      meta: {
        cached: true,
        cache_time: beijingIsoString(entry.createdAt),
        updated_at: beijingIsoString(options?.touch ? touchedAt : entry.updatedAt),
        expires_at: entry.expiresAt ? beijingIsoString(entry.expiresAt) : undefined,
        source: entry.source || undefined,
        stale: expired || undefined,
      },
    };
  }

  static async set(key: string, data: any, ttlSeconds: number, source?: string): Promise<void> {
    const db = getDb();
    const now = new Date();
    const expiresAt = ttlSeconds > 0 ? new Date(Date.now() + ttlSeconds * 1000) : null;
    const jsonData = JSON.stringify(data);

    await db.insert(schema.cache).values({
      key,
      data: jsonData,
      source,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    }).onConflictDoUpdate({
      target: schema.cache.key,
      set: { data: jsonData, source, updatedAt: now, expiresAt },
    });
  }

  static async invalidate(key: string): Promise<void> {
    const db = getDb();
    await db.delete(schema.cache).where(eq(schema.cache.key, key));
  }

  static async cleanupExpired(): Promise<void> {
    const db = getDb();
    const now = Date.now();
    await db.run(sql`DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at < ${now}`);
  }

  static async enforcePrefixLimit(prefix: string, maxEntries: number): Promise<void> {
    if (maxEntries <= 0) return;
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
  }
}
