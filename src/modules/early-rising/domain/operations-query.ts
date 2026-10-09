import type { EarlyRisingLeaderboardRow, EarlyRisingPeriod, EarlyRisingPeriodRange } from './early-rising';

export interface EarlyRisingAdminOverview {
  days: 7 | 30 | 90;
  range: EarlyRisingPeriodRange;
  todayParticipants: number;
  totalParticipants: number;
  totalCheckins: number;
  series: Array<{ date: string; count: number }>;
}

export interface EarlyRisingAdminLeaderboard {
  period: EarlyRisingPeriod;
  range: EarlyRisingPeriodRange;
  generatedAt: string;
  items: EarlyRisingLeaderboardRow[];
}

export interface EarlyRisingOperationsQueryPort {
  getAdminOverview(days: 7 | 30 | 90): Promise<EarlyRisingAdminOverview>;
  getAdminLeaderboard(period: EarlyRisingPeriod): Promise<EarlyRisingAdminLeaderboard>;
}
