/**
 * [INPUT]: 依赖构造注入的 Drizzle db、early_rising_checkins schema 与 EarlyRisingRepository 端口
 * [OUTPUT]: 对外提供 SQLiteEarlyRisingRepository，以唯一约束幂等写入并在 SQL 内派生连续值、统计、趋势和日/周/月排名
 * [POS]: modules/early-rising/infrastructure 的唯一事实 adapter，不 JOIN users/community_profiles 且不返回无界历史行集
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { schema } from '../../../db';
import type { getDb } from '../../../db';
import type {
  EarlyRisingCheckinFact,
  EarlyRisingPeriod,
  EarlyRisingPeriodRange,
  EarlyRisingRankFact,
} from '../domain/early-rising';
import type {
  EarlyRisingLeaderboardFacts,
  EarlyRisingPersonalStatistics,
  EarlyRisingRepository,
  EarlyRisingTrendFacts,
} from '../application/ports';

export type EarlyRisingDatabase = ReturnType<typeof getDb>;

function mapFact(row: typeof schema.earlyRisingCheckins.$inferSelect): EarlyRisingCheckinFact {
  return {
    id: row.id,
    userId: row.userId,
    checkinDate: row.checkinDate,
    checkedAt: row.checkedAt,
  };
}

function normalizeUserIds(userIds: readonly number[]) {
  return Array.from(new Set(userIds.filter((userId) => Number.isInteger(userId) && userId > 0)));
}

interface RawRankRow {
  user_id: number;
  rank: number;
  checked_at: number | null;
  continuity_score: number | null;
  valid_days: number | null;
}

function mapRank(row: RawRankRow): EarlyRisingRankFact {
  return {
    userId: Number(row.user_id),
    rank: Number(row.rank),
    ...(row.checked_at === null ? {} : { checkedAt: new Date(Number(row.checked_at)) }),
    ...(row.continuity_score === null ? {} : { continuityScore: Number(row.continuity_score) }),
    ...(row.valid_days === null ? {} : { validDays: Number(row.valid_days) }),
  };
}

export class SQLiteEarlyRisingRepository implements EarlyRisingRepository {
  constructor(private readonly db: EarlyRisingDatabase) {}

  async createOrGet(userId: number, checkinDate: string, checkedAt: Date) {
    return this.db.transaction((transaction) => {
      const inserted = transaction.insert(schema.earlyRisingCheckins).values({
        userId,
        checkinDate,
        checkedAt,
      }).onConflictDoNothing({
        target: [schema.earlyRisingCheckins.userId, schema.earlyRisingCheckins.checkinDate],
      }).returning().all()[0];
      if (inserted) return mapFact(inserted);

      const existing = transaction.select().from(schema.earlyRisingCheckins).where(and(
        eq(schema.earlyRisingCheckins.userId, userId),
        eq(schema.earlyRisingCheckins.checkinDate, checkinDate),
      )).limit(1).all()[0];
      if (!existing) throw new Error(`Early Rising idempotent insert lost userId=${userId} date=${checkinDate}`);
      return mapFact(existing);
    });
  }

  async findByUserAndDate(userId: number, checkinDate: string) {
    const row = await this.db.select().from(schema.earlyRisingCheckins).where(and(
      eq(schema.earlyRisingCheckins.userId, userId),
      eq(schema.earlyRisingCheckins.checkinDate, checkinDate),
    )).limit(1);
    return row[0] ? mapFact(row[0]) : null;
  }

  async getTodayRank(userId: number, checkinDate: string): Promise<number | null> {
    const rows = await this.db.all<{ rank: number }>(sql`
      WITH ranked AS (
        SELECT user_id,
               ROW_NUMBER() OVER (ORDER BY checked_at ASC, id ASC) AS rank
        FROM early_rising_checkins
        WHERE checkin_date = ${checkinDate}
      )
      SELECT rank FROM ranked WHERE user_id = ${userId}
    `);
    return rows[0] ? Number(rows[0].rank) : null;
  }

  async getPersonalStatistics(
    userId: number,
    validStreakEndDates: readonly string[],
  ): Promise<EarlyRisingPersonalStatistics> {
    const latestDate = validStreakEndDates[0]!;
    const validEnds = sql.join(validStreakEndDates.map((date) => sql`${date}`), sql`, `);
    const rows = await this.db.all<{
      total_valid_days: number;
      longest_streak: number;
      current_streak: number;
    }>(sql`
      WITH ordered AS (
        SELECT checkin_date,
               CAST(julianday(checkin_date) AS INTEGER)
                 - ROW_NUMBER() OVER (ORDER BY checkin_date) AS island_key
        FROM early_rising_checkins
        WHERE user_id = ${userId}
          AND checkin_date <= ${latestDate}
      ), runs AS (
        SELECT MAX(checkin_date) AS end_date, COUNT(*) AS run_length
        FROM ordered
        GROUP BY island_key
      )
      SELECT
        (SELECT COUNT(*) FROM early_rising_checkins WHERE user_id = ${userId}) AS total_valid_days,
        COALESCE((SELECT MAX(run_length) FROM runs), 0) AS longest_streak,
        COALESCE((
          SELECT run_length FROM runs
          WHERE end_date IN (${validEnds})
          ORDER BY end_date DESC
          LIMIT 1
        ), 0) AS current_streak
    `);
    const row = rows[0];
    return {
      totalValidDays: Number(row?.total_valid_days ?? 0),
      longestStreak: Number(row?.longest_streak ?? 0),
      currentStreak: Number(row?.current_streak ?? 0),
    };
  }

  async getCurrentStreaks(userIds: readonly number[], validStreakEndDates: readonly string[]) {
    const normalized = normalizeUserIds(userIds);
    if (normalized.length === 0) return new Map<number, number>();
    const ids = sql.join(normalized.map((userId) => sql`${userId}`), sql`, `);
    const latestDate = validStreakEndDates[0]!;
    const validEnds = sql.join(validStreakEndDates.map((date) => sql`${date}`), sql`, `);
    const rows = await this.db.all<{ user_id: number; current_streak: number }>(sql`
      WITH ordered AS (
        SELECT user_id, checkin_date,
               CAST(julianday(checkin_date) AS INTEGER)
                 - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY checkin_date) AS island_key
        FROM early_rising_checkins
        WHERE user_id IN (${ids})
          AND checkin_date <= ${latestDate}
      ), runs AS (
        SELECT user_id, MAX(checkin_date) AS end_date, COUNT(*) AS current_streak
        FROM ordered
        GROUP BY user_id, island_key
      )
      SELECT user_id, current_streak
      FROM (
        SELECT user_id, current_streak, end_date,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY end_date DESC) AS choice
        FROM runs
        WHERE end_date IN (${validEnds})
      )
      WHERE choice = 1
    `);
    return new Map(rows.map((row) => [Number(row.user_id), Number(row.current_streak)]));
  }

  async getTrend(userId: number, from: string, to: string): Promise<EarlyRisingTrendFacts> {
    const [firstRows, rows] = await Promise.all([
      this.db.select({ firstCheckinDate: sql<string | null>`min(${schema.earlyRisingCheckins.checkinDate})` })
        .from(schema.earlyRisingCheckins)
        .where(eq(schema.earlyRisingCheckins.userId, userId)),
      this.db.select().from(schema.earlyRisingCheckins).where(and(
        eq(schema.earlyRisingCheckins.userId, userId),
        gte(schema.earlyRisingCheckins.checkinDate, from),
        lte(schema.earlyRisingCheckins.checkinDate, to),
      )).orderBy(asc(schema.earlyRisingCheckins.checkinDate)),
    ]);
    return {
      firstCheckinDate: firstRows[0]?.firstCheckinDate ?? null,
      facts: rows.map(mapFact),
    };
  }

  async getLeaderboard(
    period: EarlyRisingPeriod,
    range: EarlyRisingPeriodRange,
    currentUserId: number,
    limit: number,
  ): Promise<EarlyRisingLeaderboardFacts> {
    const rows = period === 'today'
      ? await this.getTodayLeaderboard(range.from, currentUserId, limit)
      : await this.getContinuityLeaderboard(range, currentUserId, limit);
    const mapped = rows.map(mapRank);
    return {
      leaders: mapped.filter((row) => row.rank <= limit),
      me: mapped.find((row) => row.userId === currentUserId) ?? null,
    };
  }

  private getTodayLeaderboard(checkinDate: string, currentUserId: number, limit: number) {
    return this.db.all<RawRankRow>(sql`
      WITH ranked AS (
        SELECT user_id, checked_at,
               ROW_NUMBER() OVER (ORDER BY checked_at ASC, id ASC) AS rank
        FROM early_rising_checkins
        WHERE checkin_date = ${checkinDate}
      )
      SELECT user_id, rank, checked_at,
             NULL AS continuity_score, NULL AS valid_days
      FROM ranked
      WHERE rank <= ${limit} OR user_id = ${currentUserId}
      ORDER BY rank ASC
    `);
  }

  private getContinuityLeaderboard(
    range: EarlyRisingPeriodRange,
    currentUserId: number,
    limit: number,
  ) {
    return this.db.all<RawRankRow>(sql`
      WITH ordered AS (
        SELECT user_id, checkin_date, checked_at,
               CAST(julianday(checkin_date) AS INTEGER)
                 - ROW_NUMBER() OVER (
                     PARTITION BY user_id ORDER BY checkin_date
                   ) AS island_key
        FROM early_rising_checkins
        WHERE checkin_date <= ${range.to}
      ), scored AS (
        SELECT user_id, checkin_date, checked_at,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id, island_key ORDER BY checkin_date
               ) AS streak_on_day
        FROM ordered
      ), aggregated AS (
        SELECT user_id,
               SUM(MIN(streak_on_day, 7)) AS continuity_score,
               COUNT(*) AS valid_days,
               AVG((checked_at + 28800000) % 86400000) AS average_checkin_time
        FROM scored
        WHERE checkin_date BETWEEN ${range.from} AND ${range.to}
        GROUP BY user_id
      ), ranked AS (
        SELECT user_id, continuity_score, valid_days,
               ROW_NUMBER() OVER (
                 ORDER BY continuity_score DESC,
                          valid_days DESC,
                          average_checkin_time ASC,
                          user_id ASC
               ) AS rank
        FROM aggregated
      )
      SELECT user_id, rank, NULL AS checked_at, continuity_score, valid_days
      FROM ranked
      WHERE rank <= ${limit} OR user_id = ${currentUserId}
      ORDER BY rank ASC
    `);
  }
}
