/**
 * [INPUT]: 依赖 upstream、CacheService、ScheduleParser、JW URL/config 与 refresh fallback
 * [OUTPUT]: 对外提供 ScheduleService.getSchedule()
 * [POS]: services/academic 的 JW 单源课表服务，负责教务读取、周缓存、旧缓存提升与 refresh 旧值回退
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { upstream } from '../infra/upstream';
import { CacheService } from '../infra/cache-service';
import { ScheduleParser } from '../../parsers';
import { URLS } from '../../core/url-config';
import { config, JW_SJMS_VALUE } from '../../config';
import { AppError, ErrorCode } from '../../utils/errors';
import { fallbackOnRefreshFailure } from '../infra/refresh-fallback';
import type { CacheMeta } from '../../types';
import { beijingDate } from '../../utils/time';

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
}): Promise<{ data: T; _meta: CacheMeta; lookup: 'weekly' | 'legacy'; promotedFrom?: string } | null> {
  for (const currentCacheKey of [options.cacheKey, ...options.legacyCacheKeys]) {
    const fallback = await fallbackOnRefreshFailure<T>({
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

export class ScheduleService {
  static async getSchedule(userId: number, studentId: string, date?: string, forceRefresh = false, name?: string) {
    const { queryDate, weekStartDate, cacheKey, legacyCacheKeys } = buildScheduleCacheContext(studentId, date);

    if (!forceRefresh) {
      const cached = await CacheService.get(cacheKey);
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
        const legacyCached = await CacheService.get(legacyCacheKey);
        if (!legacyCached) continue;

        await CacheService.set(cacheKey, legacyCached.data, config.cacheTtl.schedule, legacyCached.meta.source || 'jw');
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

    let data: any;
    try {
      data = await upstream(userId, 'jw', async ({ client }) => {
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
      });
    } catch (error) {
      const fallback = await findScheduleRefreshFallback({
        forceRefresh,
        cacheKey,
        legacyCacheKeys,
        error,
        source: 'jw',
        studentId,
      });
      if (fallback) {
        return {
          data: fallback.data,
          _meta: { ...fallback._meta, source: fallback._meta.source || 'jw' },
          _request: {
            queryDate,
            weekStartDate,
            cacheKey,
            cache: forceRefresh ? 'bypass' : 'miss',
            fallback: 'stale',
            lookup: fallback.lookup,
            promotedFrom: fallback.promotedFrom,
          },
        };
      }
      throw error;
    }

    await CacheService.set(cacheKey, data, config.cacheTtl.schedule, 'jw');
    await CacheService.enforcePrefixLimit(`schedule:${studentId}:`, config.cacheLimit.schedulePerUser);

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
}
