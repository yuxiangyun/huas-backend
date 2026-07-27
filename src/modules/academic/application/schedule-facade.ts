/**
 * [INPUT]: 依赖 JW/Portal 单源课表用例、domain 课表契约、fallback error 与日期/错误工具
 * [OUTPUT]: 对外提供 ScheduleFacadeApplicationService、单源 reader ports 与课表结果类型
 * [POS]: academic/application 的课表编排门面，统一 JW/Portal 优先级、日期范围、fallback 与响应元信息
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CacheMeta } from '../../../types';
import { AppError, ErrorCode } from '../../../utils/errors';
import { resolveFallbackError } from '../../../utils/fallback-error';
import { beijingDate } from '../../../utils/time';
import type {
  ScheduleCacheState,
  ScheduleFacadeResult,
  ScheduleRequestMeta,
  ScheduleSource,
} from '../domain/schedule';

export type { ScheduleFacadeResult, ScheduleRequestMeta } from '../domain/schedule';

export interface JwScheduleReader {
  getSchedule(userId: number, studentId: string, date?: string, forceRefresh?: boolean, name?: string): Promise<RawScheduleResult>;
}

export interface PortalScheduleReader {
  getSchedule(userId: number, studentId: string, startDate: string, endDate: string, forceRefresh?: boolean, name?: string): Promise<RawScheduleResult>;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_PORTAL_RANGE_DAYS = 62;

type RawRequestMeta = Partial<Omit<ScheduleRequestMeta, 'cache' | 'fallback' | 'lookup'> & {
  cache: string;
  fallback: string;
  lookup: string;
}>;

type RawScheduleResult = {
  data: any;
  _meta?: Partial<CacheMeta>;
  _request?: RawRequestMeta;
};

type PortalRange = {
  startDate: string;
  endDate: string;
  rangeDays: number;
};

function parseStrictDate(value: string, fieldName: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${fieldName} 参数格式错误，应为 YYYY-MM-DD`);
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${fieldName} 参数无效`);
  }

  return parsed;
}

function normalizeJwDate(rawDate?: string): string {
  const resolved = (rawDate ?? '').trim() || beijingDate();
  parseStrictDate(resolved, 'date');
  return resolved;
}

function normalizePortalRange(startDate?: string, endDate?: string): PortalRange {
  if (!startDate || !endDate) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'Missing startDate or endDate parameter');
  }

  const normalizedStartDate = startDate.trim();
  const normalizedEndDate = endDate.trim();
  const start = parseStrictDate(normalizedStartDate, 'startDate');
  const end = parseStrictDate(normalizedEndDate, 'endDate');
  const rangeDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;

  if (rangeDays <= 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'endDate 不能早于 startDate');
  }
  if (rangeDays > MAX_PORTAL_RANGE_DAYS) {
    throw new AppError(ErrorCode.PARAM_ERROR, `日期区间不能超过 ${MAX_PORTAL_RANGE_DAYS} 天`);
  }

  return {
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    rangeDays,
  };
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(date.getUTCDate() + days);
  return next;
}

function getWeekRange(rawDate?: string): PortalRange & { queryDate: string } {
  const queryDate = normalizeJwDate(rawDate);
  const parsed = new Date(`${queryDate}T00:00:00Z`);
  const weekStart = addUtcDays(parsed, -((parsed.getUTCDay() + 6) % 7));
  const weekEnd = addUtcDays(weekStart, 6);

  return {
    queryDate,
    startDate: weekStart.toISOString().slice(0, 10),
    endDate: weekEnd.toISOString().slice(0, 10),
    rangeDays: 7,
  };
}

function isWeeklyRange(range: PortalRange): boolean {
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  return range.rangeDays === 7 && start.getUTCDay() === 1 && end.getUTCDay() === 0;
}

function buildJwRequest(studentId: string, queryDate: string, weekStartDate: string, cache: ScheduleCacheState): ScheduleRequestMeta {
  return {
    queryDate,
    weekStartDate,
    cacheKey: `schedule:${studentId}:${weekStartDate}`,
    cache,
    lookup: 'weekly',
  };
}

function buildPortalRequest(studentId: string, range: PortalRange, cache: ScheduleCacheState): ScheduleRequestMeta {
  return {
    queryDate: range.startDate,
    startDate: range.startDate,
    endDate: range.endDate,
    weekStartDate: range.startDate,
    cacheKey: `portal-schedule:${studentId}:${range.startDate}:${range.endDate}`,
    cache,
    lookup: isWeeklyRange(range) ? 'weekly' : 'range',
  };
}

function isParamError(error: unknown): boolean {
  return error instanceof AppError && error.code === ErrorCode.PARAM_ERROR;
}

function isScheduleUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message === 'SCHEDULE_NOT_AVAILABLE';
}

function completeResult(result: RawScheduleResult, source: ScheduleSource, request?: Partial<ScheduleRequestMeta>): ScheduleFacadeResult {
  const meta = result._meta ?? {};
  return {
    data: result.data,
    _meta: {
      cached: meta.cached ?? false,
      ...meta,
      source: meta.source || source,
    },
    _request: {
      ...(result._request ?? {}),
      ...request,
    } as ScheduleRequestMeta,
  };
}

function emptySchedule(source: ScheduleSource, request: ScheduleRequestMeta): ScheduleFacadeResult {
  return {
    data: {
      week: '暂无',
      courses: [],
      message: '课表暂未公布',
    },
    _meta: {
      cached: false,
      source,
    },
    _request: request,
  };
}

function resolveFallbackFailure(options: {
  primarySource: ScheduleSource;
  fallbackSource: ScheduleSource;
  primaryError: unknown;
  fallbackError: unknown;
  primaryRequest: ScheduleRequestMeta;
  fallbackRequest: ScheduleRequestMeta;
  studentId: string;
}): ScheduleFacadeResult {
  const selected = resolveFallbackError(options);
  if (!isScheduleUnavailable(selected)) throw selected;

  return emptySchedule(
    Object.is(selected, options.fallbackError) ? options.fallbackSource : options.primarySource,
    Object.is(selected, options.fallbackError) ? options.fallbackRequest : options.primaryRequest,
  );
}

export class ScheduleFacadeApplicationService {
  constructor(
    private readonly jwSchedule: JwScheduleReader,
    private readonly portalSchedule: PortalScheduleReader,
  ) {}

  async getJwFirstSchedule(options: {
    userId: number;
    studentId: string;
    date?: string;
    forceRefresh?: boolean;
    name?: string;
  }): Promise<ScheduleFacadeResult> {
    const forceRefresh = options.forceRefresh ?? false;
    const range = getWeekRange(options.date);
    const jwRequest = buildJwRequest(options.studentId, range.queryDate, range.startDate, forceRefresh ? 'bypass' : 'miss');

    try {
      const result = await this.jwSchedule.getSchedule(
        options.userId,
        options.studentId,
        range.queryDate,
        forceRefresh,
        options.name,
      );
      return completeResult(result, 'jw');
    } catch (primaryError) {
      if (isParamError(primaryError)) throw primaryError;
      if (isScheduleUnavailable(primaryError)) return emptySchedule('jw', jwRequest);

      const portalRequest = buildPortalRequest(options.studentId, range, forceRefresh ? 'bypass' : 'fallback');
      try {
        const result = await this.portalSchedule.getSchedule(
          options.userId,
          options.studentId,
          range.startDate,
          range.endDate,
          forceRefresh,
          options.name,
        );
        return completeResult(result, 'portal', {
          cache: forceRefresh ? 'bypass' : 'fallback',
          fallback: 'portal',
          lookup: 'weekly',
        });
      } catch (fallbackError) {
        return resolveFallbackFailure({
          primarySource: 'jw',
          fallbackSource: 'portal',
          primaryError,
          fallbackError,
          primaryRequest: jwRequest,
          fallbackRequest: portalRequest,
          studentId: options.studentId,
        });
      }
    }
  }

  async getPortalFirstSchedule(options: {
    userId: number;
    studentId: string;
    startDate?: string;
    endDate?: string;
    forceRefresh?: boolean;
    name?: string;
  }): Promise<ScheduleFacadeResult> {
    const forceRefresh = options.forceRefresh ?? false;
    const range = normalizePortalRange(options.startDate, options.endDate);
    const portalRequest = buildPortalRequest(options.studentId, range, forceRefresh ? 'bypass' : 'miss');

    try {
      const result = await this.portalSchedule.getSchedule(
        options.userId,
        options.studentId,
        range.startDate,
        range.endDate,
        forceRefresh,
        options.name,
      );
      return completeResult(result, 'portal');
    } catch (primaryError) {
      if (isParamError(primaryError)) throw primaryError;
      if (isScheduleUnavailable(primaryError)) return emptySchedule('portal', portalRequest);
      if (!isWeeklyRange(range)) throw primaryError;

      const jwRequest = buildJwRequest(options.studentId, range.startDate, range.startDate, forceRefresh ? 'bypass' : 'fallback');
      try {
        const result = await this.jwSchedule.getSchedule(
          options.userId,
          options.studentId,
          range.startDate,
          forceRefresh,
          options.name,
        );
        return completeResult(result, 'jw', {
          cache: forceRefresh ? 'bypass' : 'fallback',
          fallback: 'jw',
        });
      } catch (fallbackError) {
        return resolveFallbackFailure({
          primarySource: 'portal',
          fallbackSource: 'jw',
          primaryError,
          fallbackError,
          primaryRequest: portalRequest,
          fallbackRequest: jwRequest,
          studentId: options.studentId,
        });
      }
    }
  }
}
