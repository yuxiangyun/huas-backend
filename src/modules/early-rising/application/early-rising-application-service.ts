/**
 * [INPUT]: 依赖可注入 Clock、Early Rising 事实/设置仓储、CommunityDetailedProfileReader 与领域时间/DTO 规则
 * [OUTPUT]: 对外提供打卡、我的统计、有界趋势、全校日/周/月排行榜及客户端/后台展示设置用例
 * [POS]: modules/early-rising/application 的编排核心，从服务端事实派生统计、批量投影榜单资料并隔离设置读写视图
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import type { CommunityDetailedProfileReader } from '../../community/domain/ports';
import {
  EARLY_RISING_LEADERBOARD_LIMIT,
  addEarlyRisingDays,
  buildEarlyRisingWindow,
  countEarlyRisingDays,
  describeBeijingTime,
  formatEarlyRisingBeijingIso,
  isEarlyRisingCheckinOpen,
  resolveEarlyRisingPeriodRange,
  resolveEarlyRisingTrendRange,
  resolveCurrentStreakEndDates,
  type EarlyRisingLeaderboardRow,
  type EarlyRisingPeriod,
} from '../domain/early-rising';
import type {
  EarlyRisingClock,
  EarlyRisingRepository,
  EarlyRisingSettingsRepository,
} from './ports';

function mapCheckin(fact: { id: number; checkinDate: string; checkedAt: Date }) {
  return {
    id: fact.id,
    checkinDate: fact.checkinDate,
    checkedAt: formatEarlyRisingBeijingIso(fact.checkedAt),
  };
}

export class EarlyRisingApplicationService {
  constructor(
    private readonly repository: EarlyRisingRepository,
    private readonly settings: EarlyRisingSettingsRepository,
    private readonly profiles: CommunityDetailedProfileReader,
    private readonly clock: EarlyRisingClock,
  ) {}

  async getClientSettings() {
    const settings = await this.settings.get();
    return { profileEntryVisible: settings.profileEntryVisible };
  }

  async getAdminSettings() {
    const settings = await this.settings.get();
    return {
      profileEntryVisible: settings.profileEntryVisible,
      updatedAt: settings.updatedAt?.toISOString() ?? null,
      updatedBy: settings.updatedBy,
    };
  }

  async updateSettings(profileEntryVisible: boolean, updatedBy: string) {
    const settings = await this.settings.update(
      profileEntryVisible,
      this.clock.now(),
      updatedBy,
    );
    return {
      profileEntryVisible: settings.profileEntryVisible,
      updatedAt: settings.updatedAt?.toISOString() ?? null,
      updatedBy: settings.updatedBy,
    };
  }

  async checkIn(userId: number) {
    const now = this.clock.now();
    if (!isEarlyRisingCheckinOpen(now)) {
      throw new AppError(ErrorCode.PARAM_ERROR, '早起打卡仅在北京时间 05:30（含）至 09:30（不含）开放');
    }
    const checkinDate = describeBeijingTime(now).date;
    return mapCheckin(await this.repository.createOrGet(userId, checkinDate, now));
  }

  async getMe(userId: number) {
    const now = this.clock.now();
    const today = describeBeijingTime(now).date;
    const [todayCheckin, statistics] = await Promise.all([
      this.repository.findByUserAndDate(userId, today),
      this.repository.getPersonalStatistics(userId, resolveCurrentStreakEndDates(now)),
    ]);
    const todayRank = todayCheckin
      ? await this.repository.getTodayRank(userId, today)
      : null;

    return {
      serverNow: formatEarlyRisingBeijingIso(now),
      checkinWindow: buildEarlyRisingWindow(now),
      checkedInToday: todayCheckin !== null,
      checkedAt: todayCheckin ? formatEarlyRisingBeijingIso(todayCheckin.checkedAt) : null,
      todayRank,
      ...statistics,
    };
  }

  async getTrend(userId: number, query: { month?: string; from?: string; to?: string }) {
    const now = this.clock.now();
    const range = resolveEarlyRisingTrendRange(query, now);
    if (range.from > range.to) {
      return { firstCheckinDate: null, range: { from: range.from, to: range.to }, items: [] };
    }
    const trend = await this.repository.getTrend(userId, range.from, range.to);
    if (!trend.firstCheckinDate || trend.firstCheckinDate > range.to) {
      return {
        firstCheckinDate: trend.firstCheckinDate,
        range: { from: range.from, to: range.to },
        items: [],
      };
    }

    const from = trend.firstCheckinDate > range.from ? trend.firstCheckinDate : range.from;
    const byDate = new Map(trend.facts.map((fact) => [fact.checkinDate, fact]));
    const items = Array.from({ length: countEarlyRisingDays(from, range.to) }, (_, index) => {
      const date = addEarlyRisingDays(from, index);
      const fact = byDate.get(date);
      return {
        date,
        checkedAt: fact ? formatEarlyRisingBeijingIso(fact.checkedAt) : null,
      };
    });
    return {
      firstCheckinDate: trend.firstCheckinDate,
      range: { from, to: range.to },
      items,
    };
  }

  async getLeaderboard(userId: number, period: EarlyRisingPeriod) {
    const now = this.clock.now();
    const range = resolveEarlyRisingPeriodRange(period, now);
    const ranking = await this.repository.getLeaderboard(
      period,
      range,
      userId,
      EARLY_RISING_LEADERBOARD_LIMIT,
    );
    const userIds = Array.from(new Set([
      ...ranking.leaders.map((item) => item.userId),
      ...(ranking.me ? [ranking.me.userId] : []),
    ]));
    const [profiles, streaks] = await Promise.all([
      this.profiles.getManyDetailed(userIds),
      this.repository.getCurrentStreaks(userIds, resolveCurrentStreakEndDates(now)),
    ]);

    const mapRow = (fact: typeof ranking.leaders[number]): EarlyRisingLeaderboardRow => {
      const profile = profiles.get(fact.userId);
      if (!profile) throw new AppError(ErrorCode.INTERNAL_ERROR, '排行榜公共资料投影缺失');
      return {
        rank: fact.rank,
        profile,
        currentStreak: streaks.get(fact.userId) ?? 0,
        ...(period === 'today'
          ? { checkedAt: formatEarlyRisingBeijingIso(fact.checkedAt!) }
          : { continuityScore: fact.continuityScore!, validDays: fact.validDays! }),
      };
    };

    return {
      period,
      range,
      generatedAt: formatEarlyRisingBeijingIso(now),
      items: ranking.leaders.map(mapRow),
      me: ranking.me ? mapRow(ranking.me) : null,
    };
  }
}
