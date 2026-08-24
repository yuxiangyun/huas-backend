/**
 * [INPUT]: 依赖 JavaScript Date/Intl 的 Asia/Shanghai 时区能力与 Community 详细公共资料 DTO
 * [OUTPUT]: 对外提供 Early Rising 时间窗、周期/趋势范围、打卡事实、展示设置快照及统计/排行榜 HTTP DTO 的纯领域模型
 * [POS]: modules/early-rising/domain 的规则内核，统一所有北京时间裁决且不感知 Hono、SQLite 或客户端时钟
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import type { DetailedCommunityProfile } from '../../community/domain/community';

export const EARLY_RISING_TIME_ZONE = 'Asia/Shanghai';
export const EARLY_RISING_CHECKIN_START = '05:30';
export const EARLY_RISING_CHECKIN_END = '09:30';
export const EARLY_RISING_LEADERBOARD_LIMIT = 100;
export const EARLY_RISING_TREND_MAX_DAYS = 366;

const CHECKIN_START_MS = (5 * 60 + 30) * 60_000;
const CHECKIN_END_MS = (9 * 60 + 30) * 60_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

const BEIJING_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: EARLY_RISING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export type EarlyRisingPeriod = 'today' | 'week' | 'month';

export interface EarlyRisingClock {
  now(): Date;
}

export interface EarlyRisingCheckinFact {
  id: number;
  userId: number;
  checkinDate: string;
  checkedAt: Date;
}

export interface EarlyRisingPeriodRange {
  from: string;
  to: string;
}

export interface EarlyRisingTrendRange extends EarlyRisingPeriodRange {
  requestedFrom: string;
  requestedTo: string;
}

export interface EarlyRisingRankFact {
  userId: number;
  rank: number;
  checkedAt?: Date;
  continuityScore?: number;
  validDays?: number;
}

export interface EarlyRisingLeaderboardRow {
  rank: number;
  profile: DetailedCommunityProfile;
  currentStreak: number;
  checkedAt?: string;
  continuityScore?: number;
  validDays?: number;
}

export interface EarlyRisingSettingsSnapshot {
  profileEntryVisible: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
}

function dateParts(value: string) {
  const match = value.match(DATE_PATTERN);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return { year, month, day, date };
}

export function parseEarlyRisingDate(value: string, field: string): string {
  if (!dateParts(value)) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${field} 必须是有效的 YYYY-MM-DD 日期`);
  }
  return value;
}

export function addEarlyRisingDays(value: string, amount: number): string {
  const parts = dateParts(value);
  if (!parts) throw new Error(`Invalid Early Rising date: ${value}`);
  parts.date.setUTCDate(parts.date.getUTCDate() + amount);
  return parts.date.toISOString().slice(0, 10);
}

export function countEarlyRisingDays(from: string, to: string): number {
  const start = dateParts(from)?.date.getTime();
  const end = dateParts(to)?.date.getTime();
  if (start === undefined || end === undefined) throw new Error('Invalid Early Rising date range.');
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function describeBeijingTime(now: Date) {
  const parts = Object.fromEntries(
    BEIJING_DATE_TIME_FORMATTER.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const millisecondsOfDay = (
    Number(parts.hour) * 3_600_000
    + Number(parts.minute) * 60_000
    + Number(parts.second) * 1_000
    + now.getMilliseconds()
  );
  return { date, millisecondsOfDay };
}

export function formatEarlyRisingBeijingIso(now: Date): string {
  const { date } = describeBeijingTime(now);
  const time = BEIJING_DATE_TIME_FORMATTER.formatToParts(now)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  return `${date}T${time.hour}:${time.minute}:${time.second}.${String(now.getMilliseconds()).padStart(3, '0')}+08:00`;
}

export function isEarlyRisingCheckinOpen(now: Date): boolean {
  const { millisecondsOfDay } = describeBeijingTime(now);
  return millisecondsOfDay >= CHECKIN_START_MS && millisecondsOfDay < CHECKIN_END_MS;
}

export function resolveCurrentStreakEndDates(now: Date): string[] {
  const current = describeBeijingTime(now);
  return current.millisecondsOfDay < CHECKIN_END_MS
    ? [current.date, addEarlyRisingDays(current.date, -1)]
    : [current.date];
}

export function buildEarlyRisingWindow(now: Date) {
  const { date } = describeBeijingTime(now);
  return {
    timeZone: EARLY_RISING_TIME_ZONE,
    date,
    opensAt: `${date}T${EARLY_RISING_CHECKIN_START}:00.000+08:00`,
    closesAt: `${date}T${EARLY_RISING_CHECKIN_END}:00.000+08:00`,
    isOpen: isEarlyRisingCheckinOpen(now),
  };
}

export function resolveEarlyRisingPeriodRange(period: EarlyRisingPeriod, now: Date): EarlyRisingPeriodRange {
  const { date } = describeBeijingTime(now);
  if (period === 'today') return { from: date, to: date };
  const parts = dateParts(date)!;
  if (period === 'week') {
    const weekday = parts.date.getUTCDay() || 7;
    return { from: addEarlyRisingDays(date, 1 - weekday), to: date };
  }
  return { from: `${date.slice(0, 7)}-01`, to: date };
}

export function resolveEarlyRisingTrendRange(
  query: { month?: string; from?: string; to?: string },
  now: Date,
): EarlyRisingTrendRange {
  const today = describeBeijingTime(now).date;
  if (query.month && (query.from || query.to)) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'month 不能与 from/to 同时使用');
  }

  let requestedFrom: string;
  let requestedTo: string;
  if (query.month) {
    const match = query.month.match(MONTH_PATTERN);
    const year = Number(match?.[1]);
    const month = Number(match?.[2]);
    if (!match || month < 1 || month > 12) {
      throw new AppError(ErrorCode.PARAM_ERROR, 'month 必须是有效的 YYYY-MM');
    }
    requestedFrom = `${query.month}-01`;
    requestedTo = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  } else if (query.from || query.to) {
    if (!query.from || !query.to) {
      throw new AppError(ErrorCode.PARAM_ERROR, 'from 与 to 必须同时提供');
    }
    requestedFrom = parseEarlyRisingDate(query.from, 'from');
    requestedTo = parseEarlyRisingDate(query.to, 'to');
  } else {
    requestedFrom = `${today.slice(0, 7)}-01`;
    requestedTo = today;
  }

  if (requestedFrom > requestedTo) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'from 不能晚于 to');
  }
  if (countEarlyRisingDays(requestedFrom, requestedTo) > EARLY_RISING_TREND_MAX_DAYS) {
    throw new AppError(
      ErrorCode.PARAM_ERROR,
      `趋势日期范围不能超过 ${EARLY_RISING_TREND_MAX_DAYS} 天`,
    );
  }
  return {
    requestedFrom,
    requestedTo,
    from: requestedFrom,
    to: requestedTo > today ? today : requestedTo,
  };
}

export function parseEarlyRisingPeriod(value: string | undefined): EarlyRisingPeriod {
  if (value === 'today' || value === 'week' || value === 'month') return value;
  throw new AppError(ErrorCode.PARAM_ERROR, 'period 必须是 today、week 或 month');
}
