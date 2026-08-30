/**
 * [INPUT]: 依赖 domain AcademicRuntimePorts、canonical PortalScheduleParser/端点、config 与 AppError
 * [OUTPUT]: 对外提供 PortalScheduleApplicationService，并分离 current 与 stale 日期课表读取
 * [POS]: academic/application 的 Portal 单源课表用例，负责日期区间校验、同键回源合并、旧缺载荷缓存的条件淘汰与显式过期兜底
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { PortalScheduleParser } from '../../campus-integrations/portal/parsers/portal-schedule-parser';
import { URLS } from '../../campus-integrations/endpoints';
import { config } from '../../../config';
import { AppError, ErrorCode } from '../../../utils/errors';
import type { AcademicRuntimePorts } from '../domain/ports';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 62;
const MS_PER_DAY = 86_400_000;

function normalizeDate(rawDate: string, fieldName: 'startDate' | 'endDate'): string {
  const trimmed = (rawDate || '').trim();
  if (!DATE_PATTERN.test(trimmed)) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${fieldName} 参数格式错误，应为 YYYY-MM-DD`);
  }

  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${fieldName} 参数无效`);
  }
  return trimmed;
}

function getLookup(startDate: string, endDate: string, rangeDays: number): 'weekly' | 'range' {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return rangeDays === 7 && start.getUTCDay() === 1 && end.getUTCDay() === 0 ? 'weekly' : 'range';
}

function isLegacyMissingPayloadCache(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const record = data as { courses?: unknown; message?: unknown };
  return Array.isArray(record.courses)
    && record.courses.length === 0
    && typeof record.message === 'string'
    && record.message.trim().length > 0;
}

export class PortalScheduleApplicationService {
  constructor(private readonly ports: AcademicRuntimePorts) {}

  async getSchedule(
    userId: number,
    studentId: string,
    startDate: string,
    endDate: string,
    forceRefresh = false,
    name?: string
  ) {
    try {
      return await this.getCurrentSchedule(userId, studentId, startDate, endDate, forceRefresh, name);
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.PARAM_ERROR) throw error;
      const fallback = await this.getStaleSchedule(studentId, startDate, endDate, error, forceRefresh);
      if (fallback) return fallback;
      throw error;
    }
  }

  async getCurrentSchedule(
    userId: number,
    studentId: string,
    startDate: string,
    endDate: string,
    forceRefresh = false,
    name?: string
  ) {
    const normalizedStartDate = normalizeDate(startDate, 'startDate');
    const normalizedEndDate = normalizeDate(endDate, 'endDate');

    const startTime = new Date(`${normalizedStartDate}T00:00:00Z`).getTime();
    const endTime = new Date(`${normalizedEndDate}T00:00:00Z`).getTime();
    if (endTime < startTime) {
      throw new AppError(ErrorCode.PARAM_ERROR, 'endDate 不能早于 startDate');
    }

    const rangeDays = Math.floor((endTime - startTime) / MS_PER_DAY) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new AppError(ErrorCode.PARAM_ERROR, `日期区间不能超过 ${MAX_RANGE_DAYS} 天`);
    }

    const cacheKey = `portal-schedule:${studentId}:${normalizedStartDate}:${normalizedEndDate}`;
    const requestMeta = {
      queryDate: normalizedStartDate,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      weekStartDate: normalizedStartDate,
      cacheKey,
      cache: forceRefresh ? 'bypass' : 'miss',
      lookup: getLookup(normalizedStartDate, normalizedEndDate, rangeDays),
    } as const;

    if (!forceRefresh) {
      const cached = await this.ports.cache.get(cacheKey);
      if (cached) {
        // 旧版把缺失 data.schedule 的成功码写成带 message 的空表；不能继续短路 JW fallback。
        if (isLegacyMissingPayloadCache(cached.data)) {
          const invalidated = cached.versionToken
            ? await this.ports.cache.invalidateIfVersion(cacheKey, cached.versionToken)
            : false;
          if (!invalidated) {
            // 条件删除失败说明该 key 已被并发请求改写；只接受改写后的真实课表。
            const replacement = await this.ports.cache.get(cacheKey);
            if (replacement && !isLegacyMissingPayloadCache(replacement.data)) {
              return {
                data: replacement.data,
                _meta: { ...replacement.meta, source: replacement.meta.source || 'portal' },
                _request: { ...requestMeta, cache: 'hit' as const },
              };
            }
          }
        } else {
          return {
            data: cached.data,
            _meta: { ...cached.meta, source: cached.meta.source || 'portal' },
            _request: { ...requestMeta, cache: 'hit' as const },
          };
        }
      }
    }

    const data = await this.ports.cache.runSingleflight(
      cacheKey,
      forceRefresh,
      () => this.ports.upstream(userId, 'portal', async ({ client, portalToken }) => {
        const url = new URL(URLS.portalScheduleEvents);
        url.searchParams.append('startDate', normalizedStartDate);
        url.searchParams.append('endDate', normalizedEndDate);
        url.searchParams.append('reqType', 'MonthView');
        url.searchParams.append('random_number', Math.random().toString());

        const res = await client.request(url.toString(), {
          headers: { 'X-Id-Token': portalToken! },
          timeout: config.timeout.business,
        });
        return PortalScheduleParser.parse(await res.json(), normalizedStartDate, normalizedEndDate, { studentId, name });
      }),
    );

    await this.ports.cache.set(cacheKey, data, config.cacheTtl.schedule, 'portal');
    await this.ports.cache.enforcePrefixLimit(`portal-schedule:${studentId}:`, config.cacheLimit.portalSchedulePerUser);

    return { data, _meta: { cached: false, source: 'portal' }, _request: requestMeta };
  }

  async getStaleSchedule(
    studentId: string,
    startDate: string,
    endDate: string,
    error: unknown,
    forceRefresh = false,
  ) {
    const normalizedStartDate = normalizeDate(startDate, 'startDate');
    const normalizedEndDate = normalizeDate(endDate, 'endDate');
    const startTime = new Date(`${normalizedStartDate}T00:00:00Z`).getTime();
    const endTime = new Date(`${normalizedEndDate}T00:00:00Z`).getTime();
    const rangeDays = Math.floor((endTime - startTime) / MS_PER_DAY) + 1;
    const cacheKey = `portal-schedule:${studentId}:${normalizedStartDate}:${normalizedEndDate}`;
    const fallback = await this.ports.refreshFallback({
      forceRefresh,
      cacheKey,
      error,
      source: 'portal',
      studentId,
      discardCached: isLegacyMissingPayloadCache,
    });
    if (!fallback) return null;

    if (isLegacyMissingPayloadCache(fallback.data)) {
      return null;
    }

    return {
      data: fallback.data,
      _meta: { ...fallback._meta, source: fallback._meta.source || 'portal' },
      _request: {
        queryDate: normalizedStartDate,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        weekStartDate: normalizedStartDate,
        cacheKey,
        cache: forceRefresh ? 'bypass' as const : 'miss' as const,
        fallback: 'stale' as const,
        lookup: getLookup(normalizedStartDate, normalizedEndDate, rangeDays),
      },
    };
  }
}
