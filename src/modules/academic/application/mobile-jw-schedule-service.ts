/**
 * [INPUT]: 依赖窄 MobileJwSchedulePort、来源范围错误、Academic 缓存/fallback、移动课表纯解析器、OrderedCommit 与北京时间
 * [OUTPUT]: 对外提供 MobileJwScheduleApplicationService，提供第三来源 current/stale reader
 * [POS]: Academic 的移动教务周课表用例，使用真实学期日期锚点换算目标周并严格核对返回日期，遵循统一刷新缓存与降级编排
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import type { ICourse } from '../../../types';
import { AppError, ErrorCode } from '../../../utils/errors';
import { OrderedCommit } from '../../../utils/ordered-commit';
import { beijingDate } from '../../../utils/time';
import { parseMobileJwWeek } from '../../campus-integrations/mobile-jw/schedule-parser';
import { MobileJwError, protocolFailure } from '../../campus-integrations/mobile-jw/errors';
import type { AcademicRuntimePorts, MobileJwSchedulePort } from '../domain/ports';
import { ScheduleSourceUnsupportedError } from '../domain/schedule';

const WEEK_MS = 7 * 86_400_000;
const cacheWrites = new OrderedCommit();
type ScheduleData = { week: string; courses: ICourse[]; message: string };
type CachedSchedule = { v: 1; weekStartDate: string; data: ScheduleData };

function context(studentId: string, rawDate?: string) {
  const queryDate = rawDate?.trim() || beijingDate();
  const date = new Date(`${queryDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(queryDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== queryDate) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'date 参数无效');
  }
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const weekStartDate = date.toISOString().slice(0, 10);
  return { queryDate, weekStartDate, cacheKey: `mobile-jw-schedule:${studentId}:${weekStartDate}`, lookup: 'weekly' as const };
}

function validCache(value: unknown, weekStart: string): value is CachedSchedule {
  const cached = value as CachedSchedule | null;
  return !!cached && cached.v === 1 && cached.weekStartDate === weekStart && !!cached.data && Array.isArray(cached.data.courses);
}

export class MobileJwScheduleApplicationService {
  constructor(
    private readonly client: MobileJwSchedulePort,
    private readonly ports: Pick<AcademicRuntimePorts, 'cache' | 'refreshFallback'>,
  ) {}

  async getCurrentSchedule(userId: number, studentId: string, date?: string, forceRefresh = false, _name?: string) {
    const request = context(studentId, date);
    if (!forceRefresh) {
      const cached = await this.ports.cache.get<CachedSchedule>(request.cacheKey);
      if (cached && validCache(cached.data, request.weekStartDate)) return {
        data: cached.data.data, _meta: { ...cached.meta, source: 'mobile-jw' }, _request: { ...request, cache: 'hit' as const },
      };
      if (cached?.versionToken) await this.ports.cache.invalidateIfVersion(request.cacheKey, cached.versionToken);
    }
    const data = await this.ports.cache.runSingleflight(request.cacheKey, forceRefresh, () => cacheWrites.run(
      request.cacheKey,
      async () => {
        const deadlineAt = Date.now() + config.timeout.mobileJwTotalBudget;
        const initial = parseMobileJwWeek((await this.client.current(userId, {}, deadlineAt)).data);
        let result = initial;
        if (initial.weekStartDate !== request.weekStartDate) {
          const offset = (Date.parse(request.weekStartDate) - Date.parse(initial.weekStartDate)) / WEEK_MS;
          const week = initial.week + offset;
          // 该接口只保证当前学期；不把历史端点的假空态写成真实“无课”。
          if (initial.maxWeek === null) throw protocolFailure();
          if (!Number.isInteger(week) || week < 1 || week > initial.maxWeek) throw new ScheduleSourceUnsupportedError();
          result = parseMobileJwWeek((await this.client.current(userId, { week }, deadlineAt)).data);
          if (result.week !== week || (result.semesterId && initial.semesterId && result.semesterId !== initial.semesterId)) throw protocolFailure();
        }
        if (result.weekStartDate !== request.weekStartDate) throw protocolFailure();
        return { week: `第${result.week}周`, courses: result.courses, message: result.courses.length ? '' : '本周暂无课程' };
      },
      (fresh) => this.ports.cache.set(request.cacheKey, { v: 1, weekStartDate: request.weekStartDate, data: fresh }, config.cacheTtl.schedule, 'mobile-jw'),
    ));
    await this.ports.cache.enforcePrefixLimit(`mobile-jw-schedule:${studentId}:`, config.cacheLimit.portalSchedulePerUser);
    return { data, _meta: { cached: false, source: 'mobile-jw' }, _request: { ...request, cache: forceRefresh ? 'bypass' as const : 'miss' as const } };
  }

  async getStaleSchedule(studentId: string, date: string | undefined, error: unknown, forceRefresh = false) {
    if (error instanceof MobileJwError && (error.kind === 'protocol' || error.kind === 'business')) return null;
    const request = context(studentId, date);
    const fallback = await this.ports.refreshFallback<CachedSchedule>({
      forceRefresh, cacheKey: request.cacheKey, error, source: 'mobile-jw', studentId,
      discardCached: (value) => !validCache(value, request.weekStartDate),
    });
    if (!fallback || !validCache(fallback.data, request.weekStartDate)) return null;
    return { data: fallback.data.data, _meta: fallback._meta, _request: { ...request, cache: 'fallback' as const, fallback: 'stale' as const } };
  }
}
