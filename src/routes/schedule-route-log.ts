/**
 * [INPUT]: 依赖 Hono Context、含策略观测字段的 ScheduleFacadeResult 与 http-log 明细工具
 * [OUTPUT]: 对外提供 appendScheduleRouteLog，统一记录双源课表路由的模式、来源与回退摘要
 * [POS]: routes 的课表日志适配器，被统一策略入口与 legacy Portal 路由复用，不承载 fallback 业务判断
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { Context } from 'hono';
import type { ScheduleFacadeResult } from '../services/academic/schedule-facade';
import { appendHttpLogDetail, formatHttpLogDetail } from '../utils/http-log';

type SchedulePrimarySource = 'jw' | 'portal';

export function appendScheduleRouteLog(
  c: Context,
  result: ScheduleFacadeResult,
  forceRefresh: boolean,
  legacyPrimarySource?: SchedulePrimarySource
) {
  const requestMeta = result._request;
  const primarySource = result._meta.primary_source || legacyPrimarySource;
  appendHttpLogDetail(c, formatHttpLogDetail({
    week: result.data?.week,
    courses: Array.isArray(result.data?.courses) ? result.data.courses.length : undefined,
    cache: requestMeta.cache,
    refresh: forceRefresh ? true : undefined,
    fallback: requestMeta.fallback,
    mode: result._meta.policy_mode,
    primary: primarySource,
    source: result._meta.source,
    lookup: requestMeta.lookup && requestMeta.lookup !== 'weekly' ? requestMeta.lookup : undefined,
    promoted: requestMeta.promotedFrom ? 'legacy' : undefined,
  }));
}
