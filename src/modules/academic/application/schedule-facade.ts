/**
 * [INPUT]: 依赖移动教务/JW/Portal current/stale readers、来源策略快照、fallback error 与日期/错误工具
 * [OUTPUT]: 对外提供 ScheduleFacadeApplicationService、单源 reader ports、统一有序三源编排与移动教务固定单源入口
 * [POS]: academic/application 的课表编排门面，先穷尽 current 再固定读 stale，仲裁排除来源能力限制并保留 legacy 未公布短路
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CacheMeta } from '../../../types';
import { ScheduleSourceUnsupportedError } from '../domain/schedule';
import { AppError, ErrorCode } from '../../../utils/errors';
import { resolveFallbackError } from '../../../utils/fallback-error';
import { beijingDate } from '../../../utils/time';
import type {
  ScheduleCacheState,
  ScheduleFacadeResult,
  ScheduleRequestMeta,
  ScheduleSource,
} from '../domain/schedule';
import {
  getScheduleSourcePlan,
  type ScheduleSourceMode,
  type ScheduleSourcePolicySnapshot,
} from '../domain/schedule-source-policy';

export type { ScheduleFacadeResult, ScheduleRequestMeta } from '../domain/schedule';

export interface JwScheduleReader {
  getCurrentSchedule(
    userId: number,
    studentId: string,
    date?: string,
    forceRefresh?: boolean,
    name?: string,
  ): Promise<RawScheduleResult>;
  getStaleSchedule(
    studentId: string,
    date: string | undefined,
    error: unknown,
    forceRefresh?: boolean,
  ): Promise<RawScheduleResult | null>;
}

export interface PortalScheduleReader {
  getCurrentSchedule(
    userId: number,
    studentId: string,
    startDate: string,
    endDate: string,
    forceRefresh?: boolean,
    name?: string,
  ): Promise<RawScheduleResult>;
  getStaleSchedule(
    studentId: string,
    startDate: string,
    endDate: string,
    error: unknown,
    forceRefresh?: boolean,
  ): Promise<RawScheduleResult | null>;
}

export interface ScheduleSourcePolicyReader {
  status(): Promise<ScheduleSourcePolicySnapshot>;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_PORTAL_RANGE_DAYS = 62;
const STALE_SOURCE_PLAN = ['mobile-jw', 'jw', 'portal'] as const;

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

type OrchestrationOptions = {
  userId: number;
  studentId: string;
  name?: string;
  forceRefresh: boolean;
  range: PortalRange & { queryDate?: string };
  plan: readonly ScheduleSource[];
  stopOnUnavailable: boolean;
  policy?: ScheduleSourcePolicySnapshot;
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

  if (rangeDays <= 0) throw new AppError(ErrorCode.PARAM_ERROR, 'endDate 不能早于 startDate');
  if (rangeDays > MAX_PORTAL_RANGE_DAYS) {
    throw new AppError(ErrorCode.PARAM_ERROR, `日期区间不能超过 ${MAX_PORTAL_RANGE_DAYS} 天`);
  }

  return { startDate: normalizedStartDate, endDate: normalizedEndDate, rangeDays };
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

function isCredentialError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.code === ErrorCode.CREDENTIAL_EXPIRED || error.code === ErrorCode.JWT_INVALID;
  }
  return error instanceof Error && error.message === 'SESSION_EXPIRED';
}

function isScheduleUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message === 'SCHEDULE_NOT_AVAILABLE';
}

function completeResult(
  result: RawScheduleResult,
  source: ScheduleSource,
  primarySource: ScheduleSource,
  fallback: ScheduleSource | 'stale' | undefined,
  policy?: ScheduleSourcePolicySnapshot,
): ScheduleFacadeResult {
  const meta = result._meta ?? {};
  return {
    data: result.data,
    _meta: {
      cached: meta.cached ?? false,
      ...meta,
      source: meta.source || source,
      primary_source: primarySource,
      fallback,
      ...(policy ? { policy_mode: policy.mode } : {}),
    },
    _request: {
      ...(result._request ?? {}),
      ...(fallback ? { fallback } : {}),
    } as ScheduleRequestMeta,
  };
}

function emptySchedule(
  source: ScheduleSource,
  primarySource: ScheduleSource,
  request: ScheduleRequestMeta,
  policy?: ScheduleSourcePolicySnapshot,
): ScheduleFacadeResult {
  return {
    data: { week: '暂无', courses: [], message: '课表暂未公布' },
    _meta: {
      cached: false,
      source,
      primary_source: primarySource,
      ...(policy ? { policy_mode: policy.mode } : {}),
    },
    _request: request,
  };
}

function selectFailure(
  errors: ReadonlyMap<ScheduleSource, unknown>,
  plan: readonly ScheduleSource[],
  studentId: string,
): unknown {
  const supportedPlan = plan.filter((source) => !(errors.get(source) instanceof ScheduleSourceUnsupportedError));
  if (!supportedPlan.length) return new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '没有支持该日期的课表来源');
  let selectedSource = supportedPlan[0];
  let selected = errors.get(selectedSource);
  for (const source of supportedPlan.slice(1)) {
    const fallbackError = errors.get(source);
    if (fallbackError === undefined) continue;
    const next = resolveFallbackError({ primarySource: selectedSource, fallbackSource: source, primaryError: selected, fallbackError, studentId });
    if (Object.is(next, fallbackError)) selectedSource = source;
    selected = next;
  }
  return selected;
}

export class ScheduleFacadeApplicationService {
  constructor(
    private readonly jwSchedule: JwScheduleReader,
    private readonly portalSchedule: PortalScheduleReader,
    private readonly policy?: ScheduleSourcePolicyReader,
    private readonly mobileJwSchedule?: JwScheduleReader,
  ) {}

  async getSchedule(options: {
    userId: number;
    studentId: string;
    date?: string;
    forceRefresh?: boolean;
    name?: string;
  }): Promise<ScheduleFacadeResult> {
    if (!this.policy) throw new Error('SCHEDULE_SOURCE_POLICY_NOT_CONFIGURED');
    const policy = await this.policy.status();
    return this.orchestrate({
      ...options,
      forceRefresh: options.forceRefresh ?? false,
      range: getWeekRange(options.date),
      plan: getScheduleSourcePlan(policy.mode),
      stopOnUnavailable: false,
      policy,
    });
  }

  async getMobileJwSchedule(options: {
    userId: number;
    studentId: string;
    date?: string;
    forceRefresh?: boolean;
    name?: string;
  }): Promise<ScheduleFacadeResult> {
    return this.orchestrate({
      ...options,
      forceRefresh: options.forceRefresh ?? false,
      range: getWeekRange(options.date),
      plan: ['mobile-jw'],
      stopOnUnavailable: false,
    });
  }

  async getJwFirstSchedule(options: {
    userId: number;
    studentId: string;
    date?: string;
    forceRefresh?: boolean;
    name?: string;
  }): Promise<ScheduleFacadeResult> {
    return this.orchestrate({
      ...options,
      forceRefresh: options.forceRefresh ?? false,
      range: getWeekRange(options.date),
      plan: getScheduleSourcePlan('jw-first'),
      stopOnUnavailable: true,
    });
  }

  async getPortalFirstSchedule(options: {
    userId: number;
    studentId: string;
    startDate?: string;
    endDate?: string;
    forceRefresh?: boolean;
    name?: string;
  }): Promise<ScheduleFacadeResult> {
    const range = normalizePortalRange(options.startDate, options.endDate);
    const plan = isWeeklyRange(range) ? getScheduleSourcePlan('portal-first') : ['portal'] as const;
    return this.orchestrate({
      ...options,
      forceRefresh: options.forceRefresh ?? false,
      range,
      plan,
      stopOnUnavailable: true,
    });
  }

  private async orchestrate(options: OrchestrationOptions): Promise<ScheduleFacadeResult> {
    const primarySource = options.plan[0];
    const errors = new Map<ScheduleSource, unknown>();

    for (const source of options.plan) {
      try {
        const result = await this.readCurrent(source, options);
        return completeResult(
          result,
          source,
          primarySource,
          source === primarySource ? undefined : source,
          options.policy,
        );
      } catch (currentError) {
        if (isParamError(currentError)) throw currentError;
        errors.set(source, currentError);
        if (options.stopOnUnavailable && source === primarySource && isScheduleUnavailable(currentError)) {
          const stale = await this.readStale(source, currentError, options);
          if (stale) return completeResult(stale, source, primarySource, 'stale', options.policy);
          return emptySchedule(source, primarySource, this.requestFor(source, options), options.policy);
        }
      }
    }

    const selectedError = selectFailure(errors, options.plan, options.studentId);
    if (isCredentialError(selectedError)) throw selectedError;

    for (const source of STALE_SOURCE_PLAN) {
      if (!errors.has(source) || !options.plan.includes(source)) continue;
      const stale = await this.readStale(source, errors.get(source), options);
      if (stale) return completeResult(stale, source, primarySource, 'stale', options.policy);
    }

    if (isScheduleUnavailable(selectedError)) {
      const selectedSource = options.plan.find((source) => Object.is(errors.get(source), selectedError)) ?? primarySource;
      return emptySchedule(selectedSource, primarySource, this.requestFor(selectedSource, options), options.policy);
    }
    throw selectedError;
  }

  private readCurrent(source: ScheduleSource, options: OrchestrationOptions): Promise<RawScheduleResult> {
    if (source === 'jw' || source === 'mobile-jw') {
      const reader = source === 'jw' ? this.jwSchedule : this.mobileJwSchedule;
      if (!reader) throw new ScheduleSourceUnsupportedError();
      return reader.getCurrentSchedule(
        options.userId,
        options.studentId,
        options.range.queryDate ?? options.range.startDate,
        options.forceRefresh,
        options.name,
      );
    }
    return this.portalSchedule.getCurrentSchedule(
      options.userId,
      options.studentId,
      options.range.startDate,
      options.range.endDate,
      options.forceRefresh,
      options.name,
    );
  }

  private readStale(source: ScheduleSource, sourceError: unknown, options: OrchestrationOptions) {
    if (source === 'jw' || source === 'mobile-jw') {
      const reader = source === 'jw' ? this.jwSchedule : this.mobileJwSchedule;
      if (!reader) return Promise.resolve(null);
      return reader.getStaleSchedule(
        options.studentId,
        options.range.queryDate ?? options.range.startDate,
        sourceError,
        options.forceRefresh,
      );
    }
    return this.portalSchedule.getStaleSchedule(
      options.studentId,
      options.range.startDate,
      options.range.endDate,
      sourceError,
      options.forceRefresh,
    );
  }

  private requestFor(source: ScheduleSource, options: OrchestrationOptions): ScheduleRequestMeta {
    const cache = options.forceRefresh ? 'bypass' : 'miss';
    if (source === 'mobile-jw') return {
      ...buildJwRequest(options.studentId, options.range.queryDate ?? options.range.startDate, options.range.startDate, cache),
      cacheKey: `mobile-jw-schedule:${options.studentId}:${options.range.startDate}`,
    };
    if (source === 'jw') {
      return buildJwRequest(
        options.studentId,
        options.range.queryDate ?? options.range.startDate,
        options.range.startDate,
        cache,
      );
    }
    return buildPortalRequest(options.studentId, options.range, cache);
  }
}

export type { ScheduleSourceMode, ScheduleSourcePolicySnapshot } from '../domain/schedule-source-policy';
