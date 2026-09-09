/**
 * [INPUT]: 依赖窄 MobileJwSchedulePort、来源范围错误、Academic 缓存/fallback、移动课表纯解析器、OrderedCommit、Logger 与北京时间
 * [OUTPUT]: 对外提供 MobileJwScheduleApplicationService，提供第三来源 current/stale reader
 * [POS]: Academic 的移动教务周课表用例，以当前周日期锚点换算 DTO 教学周，按完整七天日期确认目标周；回源失败记录低敏感阶段后交由统一降级编排
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import type { ICourse } from '../../../types';
import { AppError, ErrorCode } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';
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
      () => this.fetchSchedule(userId, request.weekStartDate, forceRefresh),
      (fresh) => this.ports.cache.set(request.cacheKey, { v: 1, weekStartDate: request.weekStartDate, data: fresh }, config.cacheTtl.schedule, 'mobile-jw'),
    ));
    await this.ports.cache.enforcePrefixLimit(`mobile-jw-schedule:${studentId}:`, config.cacheLimit.portalSchedulePerUser);
    return { data, _meta: { cached: false, source: 'mobile-jw' }, _request: { ...request, cache: forceRefresh ? 'bypass' as const : 'miss' as const } };
  }

  private async fetchSchedule(userId: number, weekStartDate: string, forceRefresh: boolean): Promise<ScheduleData> {
    const deadlineAt = Date.now() + config.timeout.mobileJwTotalBudget;
    let stage = 'anchor_request';
    let targetWeek: number | null = null;
    let returnedWeek: number | null = null;
    try {
      const initialResponse = await this.client.current(userId, {}, deadlineAt);
      stage = 'anchor_parse';
      const initial = parseMobileJwWeek(initialResponse.data);
      returnedWeek = initial.week;
      stage = 'target_resolution';
      const offset = (Date.parse(weekStartDate) - Date.parse(initial.weekStartDate)) / WEEK_MS;
      targetWeek = initial.week + offset;
      let result = initial;
      if (initial.weekStartDate !== weekStartDate) {
        // 该接口只保证当前学期；不把历史端点的假空态写成真实“无课”。
        if (initial.maxWeek === null) throw protocolFailure();
        if (!Number.isInteger(targetWeek) || targetWeek < 1 || targetWeek > initial.maxWeek) throw new ScheduleSourceUnsupportedError();
        stage = 'target_request';
        returnedWeek = null;
        const response = await this.client.current(userId, { week: targetWeek }, deadlineAt);
        stage = 'target_parse';
        result = parseMobileJwWeek(response.data);
        returnedWeek = result.week;
        stage = 'semester_validation';
        if (result.semesterId && initial.semesterId && result.semesterId !== initial.semesterId) throw protocolFailure();
      }
      stage = 'date_validation';
      // 解析器已保证周一至周日连续七天；起点一致即完整目标周一致。
      if (result.weekStartDate !== weekStartDate) throw protocolFailure();
      // 指定周响应的 week 可能仍为当前周，展示周次由已验证的日期锚点换算。
      return { week: `第${targetWeek}周`, courses: result.courses, message: result.courses.length ? '' : '本周暂无课程' };
    } catch (error) {
      const kind = error instanceof MobileJwError ? error.kind
        : error instanceof ScheduleSourceUnsupportedError ? 'unsupported'
        : error instanceof AppError ? 'application' : 'unknown';
      // 只记录内部用户 ID、受控分类及日期/周次，不输出异常原文、课程或学校凭证。
      Logger.warn('MobileJwSchedule', '移动教务课表回源失败，交由来源编排处理', [
        'source=mobile-jw', `userId=${userId}`, `stage=${stage}`, `kind=${kind}`,
        `code=${error instanceof AppError ? error.code : 'none'}`, `forceRefresh=${forceRefresh}`,
        `weekStartDate=${weekStartDate}`, `targetWeek=${targetWeek ?? 'unknown'}`, `returnedWeek=${returnedWeek ?? 'unknown'}`,
      ].join('; '));
      throw error;
    }
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
