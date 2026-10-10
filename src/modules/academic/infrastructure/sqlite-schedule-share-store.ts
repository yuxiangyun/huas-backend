import { eq } from 'drizzle-orm';
import { schema, type getDb } from '../../../db';
import type { ScheduleShareStore, SharedSchedule } from '../domain/schedule-share';

/** 只写新快照，不提供更新或删除；读取不触达学校账户及业务缓存。 */
export class SQLiteScheduleShareStore implements ScheduleShareStore {
  constructor(private readonly db: ReturnType<typeof getDb>) {}

  async insert(tokenHash: string, schedule: SharedSchedule): Promise<void> {
    this.db.insert(schema.scheduleShares).values({ tokenHash, snapshotJson: JSON.stringify(schedule) }).run();
  }

  async find(tokenHash: string): Promise<SharedSchedule | null> {
    const row = this.db.select({ snapshotJson: schema.scheduleShares.snapshotJson })
      .from(schema.scheduleShares).where(eq(schema.scheduleShares.tokenHash, tokenHash)).get();
    return row ? JSON.parse(row.snapshotJson) as SharedSchedule : null;
  }
}
