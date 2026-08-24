/**
 * [INPUT]: 依赖 Early Rising 事实、周期范围、排行榜候选与展示设置快照领域类型
 * [OUTPUT]: 对外提供打卡事实仓储、单行展示设置仓储与可注入 Clock 的 application 依赖倒置端口
 * [POS]: modules/early-rising/application 的外部能力边界，使时间测试、SQLite 事实与设置实现均可替换
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type {
  EarlyRisingCheckinFact,
  EarlyRisingClock,
  EarlyRisingPeriod,
  EarlyRisingPeriodRange,
  EarlyRisingRankFact,
  EarlyRisingSettingsSnapshot,
} from '../domain/early-rising';

export interface EarlyRisingPersonalStatistics {
  totalValidDays: number;
  longestStreak: number;
  currentStreak: number;
}

export interface EarlyRisingTrendFacts {
  firstCheckinDate: string | null;
  facts: EarlyRisingCheckinFact[];
}

export interface EarlyRisingLeaderboardFacts {
  leaders: EarlyRisingRankFact[];
  me: EarlyRisingRankFact | null;
}

export interface EarlyRisingRepository {
  createOrGet(userId: number, checkinDate: string, checkedAt: Date): Promise<EarlyRisingCheckinFact>;
  findByUserAndDate(userId: number, checkinDate: string): Promise<EarlyRisingCheckinFact | null>;
  getTodayRank(userId: number, checkinDate: string): Promise<number | null>;
  getPersonalStatistics(userId: number, validStreakEndDates: readonly string[]): Promise<EarlyRisingPersonalStatistics>;
  getCurrentStreaks(userIds: readonly number[], validStreakEndDates: readonly string[]): Promise<Map<number, number>>;
  getTrend(userId: number, from: string, to: string): Promise<EarlyRisingTrendFacts>;
  getLeaderboard(
    period: EarlyRisingPeriod,
    range: EarlyRisingPeriodRange,
    currentUserId: number,
    limit: number,
  ): Promise<EarlyRisingLeaderboardFacts>;
}

export interface EarlyRisingSettingsRepository {
  get(): Promise<EarlyRisingSettingsSnapshot>;
  update(
    profileEntryVisible: boolean,
    updatedAt: Date,
    updatedBy: string,
  ): Promise<EarlyRisingSettingsSnapshot>;
}

export type { EarlyRisingClock };
