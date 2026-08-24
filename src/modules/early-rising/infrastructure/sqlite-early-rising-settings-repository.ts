/**
 * [INPUT]: 依赖构造注入的 Drizzle db、early_rising_settings schema 与 EarlyRisingSettingsRepository 端口
 * [OUTPUT]: 对外提供 SQLiteEarlyRisingSettingsRepository，以 id=1 的 upsert 读写展示开关及审计快照
 * [POS]: modules/early-rising/infrastructure 的设置 adapter，与打卡事实仓储隔离并随 SQLite 一致性快照持久化
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { eq } from 'drizzle-orm';
import { schema } from '../../../db';
import type { getDb } from '../../../db';
import type { EarlyRisingSettingsSnapshot } from '../domain/early-rising';
import type { EarlyRisingSettingsRepository } from '../application/ports';

const SETTINGS_ID = 1;

function mapSettings(
  row: typeof schema.earlyRisingSettings.$inferSelect,
): EarlyRisingSettingsSnapshot {
  return {
    profileEntryVisible: row.profileEntryVisible,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

export class SQLiteEarlyRisingSettingsRepository implements EarlyRisingSettingsRepository {
  constructor(private readonly db: ReturnType<typeof getDb>) {}

  async get(): Promise<EarlyRisingSettingsSnapshot> {
    const row = await this.db.select().from(schema.earlyRisingSettings)
      .where(eq(schema.earlyRisingSettings.id, SETTINGS_ID)).limit(1);
    if (!row[0]) throw new Error('Early Rising settings singleton is missing');
    return mapSettings(row[0]);
  }

  async update(
    profileEntryVisible: boolean,
    updatedAt: Date,
    updatedBy: string,
  ): Promise<EarlyRisingSettingsSnapshot> {
    const row = await this.db.insert(schema.earlyRisingSettings).values({
      id: SETTINGS_ID,
      profileEntryVisible,
      updatedAt,
      updatedBy,
    }).onConflictDoUpdate({
      target: schema.earlyRisingSettings.id,
      set: { profileEntryVisible, updatedAt, updatedBy },
    }).returning().get();
    return mapSettings(row);
  }
}
