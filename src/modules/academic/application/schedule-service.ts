/**
 * [INPUT]: 依赖 OrderedCommit 的并发提交顺序保护，依赖 domain AcademicRuntimePorts、canonical ScheduleParser/JW 端点、配置、CacheMeta 与北京时间
 * [OUTPUT]: 对外提供可注入 AcademicRuntimePorts 的 ScheduleApplicationService，并分离 current 与 stale 读取
 * [POS]: academic/application 的 JW 单源课表用例，负责教务读取、同意图回源合并、代次提交周缓存、保留数据时间且不覆盖新值的旧缓存提升与显式旧值回退
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ScheduleParser } from '../../campus-integrations/jw/parsers/schedule-parser';
import { URLS } from '../../campus-integrations/endpoints';
import { OrderedCommit } from '../../../utils/ordered-commit';
import { config, JW_SJMS_VALUE } from '../../../config';
import { AppError, ErrorCode } from '../../../utils/errors';
import type { CacheMeta } from '../../../types';
import { beijingDate } from '../../../utils/time';
import type { AcademicRuntimePorts } from '../domain/ports';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(rawDate?: string): string {
  const trimmed = (rawDate ?? '').trim();
  const resolved = trimmed || beijingDate();
  if (!DATE_PATTERN.test(resolved)) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'date 参数格式错误，应为 YYYY-MM-DD');
  }

  const parsed = new Date(`${resolved}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== resolved) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'date 参数无效');
  }
  return resolved;
}

function getWeekStartDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  const weekday = parsed.getUTCDay();
  const diffToMonday = (weekday + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - diffToMonday);
  return parsed.toISOString().slice(0, 10);
}

function getDatesInWeek(weekStartDate: string): string[] {
  const start = new Date(`${weekStartDate}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, offset) => {
    const current = new Date(start);
    current.setUTCDate(start.getUTCDate() + offset);
    return current.toISOString().slice(0, 10);
  });
}

function buildScheduleCacheContext(studentId: string, rawDate?: string) {
  const queryDate = normalizeDate(rawDate);
  const weekStartDate = getWeekStartDate(queryDate);
  const cacheKey = `schedule:${studentId}:${weekStartDate}`;
  const legacyCacheKeys = [
    queryDate,
    ...getDatesInWeek(weekStartDate).filter((date) => date !== queryDate),
  ]
    .map((date) => `schedule:${studentId}:${date}`)
    .filter((key) => key !== cacheKey);

  return {
    queryDate,
    weekStartDate,
    cacheKey,
    legacyCacheKeys,
  };
}

async function findScheduleRefreshFallback<T>(options: {
  forceRefresh: boolean;
  cacheKey: string;
  legacyCacheKeys: string[];
  error: unknown;
  source: string;
  studentId: string;
  refreshFallback: AcademicRuntimePorts['refreshFallback'];
}): Promise<{ data: T; _meta: CacheMeta; lookup: 'weekly' | 'legacy'; promotedFrom?: string } | null> {
  for (const currentCacheKey of [options.cacheKey, ...options.legacyCacheKeys]) {
    const fallback = await options.refreshFallback<T>({
      forceRefresh: options.forceRefresh,
      cacheKey: currentCacheKey,
      error: options.error,
      source: options.source,
      studentId: options.studentId,
    });
    if (!fallback) continue;

    if (currentCacheKey === options.cacheKey) {
      return {
        data: fallback.data,
        _meta: fallback._meta,
        lookup: 'weekly',
      };
    }

    return {
      data: fallback.data,
      _meta: fallback._meta,
      lookup: 'legacy',
      promotedFrom: currentCacheKey,
    };
  }

  return null;
}

const cacheWrites = new OrderedCommit();

export class ScheduleApplicationService {
  constructor(private readonly ports: AcademicRuntimePorts) {}

  async getSchedule(userId: number, studentId: string, date?: string, forceRefresh = false, name?: string) {
    try {
      return await this.getCurrentSchedule(userId, studentId, date, forceRefresh, name);
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.PARAM_ERROR) throw error;
      const fallback = await this.getStaleSchedule(studentId, date, error, forceRefresh);
      if (fallback) return fallback;
      throw error;
    }
  }

  async getCurrentSchedule(userId: number, studentId: string, date?: string, forceRefresh = false, name?: string) {
    const { queryDate, weekStartDate, cacheKey, legacyCacheKeys } = buildScheduleCacheContext(studentId, date);

    if (!forceRefresh) {
      const cached = await this.ports.cache.get(cacheKey);
      if (cached) {
        return {
          data: cached.data,
          _meta: { ...cached.meta, source: cached.meta.source || 'jw' },
          _request: {
            queryDate,
            weekStartDate,
            cacheKey,
            cache: 'hit',
            lookup: 'weekly',
          },
        };
      }

      for (const legacyCacheKey of legacyCacheKeys) {
        const legacyCached = await this.ports.cache.get(legacyCacheKey);
        if (!legacyCached) continue;

        if (legacyCached.versionToken) {
          await this.ports.cache.promoteIfAbsent?.(legacyCacheKey, cacheKey, legacyCached.versionToken);
        }
        return {
          data: legacyCached.data,
          _meta: { ...legacyCached.meta, source: legacyCached.meta.source || 'jw' },
          _request: {
            queryDate,
            weekStartDate,
            cacheKey,
            cache: 'hit',
            lookup: 'legacy',
            promotedFrom: legacyCacheKey,
          },
        };
      }
    }

    const data = await this.ports.cache.runSingleflight(
      cacheKey,
      forceRefresh,
      () => cacheWrites.run(cacheKey, () => this.ports.upstream(userId, 'jw', async ({ client }) => {
        const params = new URLSearchParams();
        params.append('rq', queryDate);
        params.append('sjmsValue', JW_SJMS_VALUE);

        const res = await client.request(URLS.kbApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: params,
          timeout: config.timeout.business,
        });
        return ScheduleParser.parse(await res.text(), { studentId, name });
      }), async (fresh) => {
        await this.ports.cache.set(cacheKey, fresh, config.cacheTtl.schedule, 'jw');
      }),
    );

    await this.ports.cache.enforcePrefixLimit(`schedule:${studentId}:`, config.cacheLimit.schedulePerUser);

    return {
      data,
      _meta: { cached: false, source: 'jw' },
      _request: {
        queryDate,
        weekStartDate,
        cacheKey,
        cache: forceRefresh ? 'bypass' : 'miss',
        lookup: 'weekly',
      },
    };
  }

  async getStaleSchedule(studentId: string, date: string | undefined, error: unknown, forceRefresh = false) {
    const { queryDate, weekStartDate, cacheKey, legacyCacheKeys } = buildScheduleCacheContext(studentId, date);
    const fallback = await findScheduleRefreshFallback({
      forceRefresh,
      cacheKey,
      legacyCacheKeys,
      error,
      source: 'jw',
      studentId,
      refreshFallback: this.ports.refreshFallback,
    });
    if (!fallback) return null;

    return {
      data: fallback.data,
      _meta: { ...fallback._meta, source: fallback._meta.source || 'jw' },
      _request: {
        queryDate,
        weekStartDate,
        cacheKey,
        cache: forceRefresh ? 'bypass' as const : 'miss' as const,
        fallback: 'stale' as const,
        lookup: fallback.lookup,
        promotedFrom: fallback.promotedFrom,
      },
    };
  }
}
