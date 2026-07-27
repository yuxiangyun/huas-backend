/**
 * [INPUT]: 依赖 domain AcademicRuntimePorts、canonical PortalScheduleParser/端点、config 与 AppError
 * [OUTPUT]: 对外提供 PortalScheduleApplicationService，返回日期课表、缓存与 _request 元信息
 * [POS]: academic/application 的 Portal 单源课表用例，负责日期区间校验、同键回源合并、缓存与过期兜底
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
        return {
          data: cached.data,
          _meta: { ...cached.meta, source: cached.meta.source || 'portal' },
          _request: { ...requestMeta, cache: 'hit' as const },
        };
      }
    }

    let data: any;
    try {
      data = await this.ports.cache.runSingleflight(
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
    } catch (error) {
      const fallback = await this.ports.refreshFallback({
        forceRefresh,
        cacheKey,
        error,
        source: 'portal',
        studentId,
      });
      if (fallback) {
        return {
          data: fallback.data,
          _meta: { ...fallback._meta, source: fallback._meta.source || 'portal' },
          _request: { ...requestMeta, fallback: 'stale' as const },
        };
      }
      throw error;
    }

    await this.ports.cache.set(cacheKey, data, config.cacheTtl.schedule, 'portal');
    await this.ports.cache.enforcePrefixLimit(`portal-schedule:${studentId}:`, config.cacheLimit.portalSchedulePerUser);

    return { data, _meta: { cached: false, source: 'portal' }, _request: requestMeta };
  }
}
