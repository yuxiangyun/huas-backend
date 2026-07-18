/**
 * [INPUT]: 依赖 Hono Context、ScheduleFacadeResult 与 http-log 明细工具
 * [OUTPUT]: 对外提供 appendScheduleRouteLog，统一记录双源课表路由的请求结果摘要
 * [POS]: routes 的课表日志适配器，被 JW 优先与 Portal 优先路由共同复用，不承载 fallback 业务判断
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
  primarySource: SchedulePrimarySource
) {
  const requestMeta = result._request;
  appendHttpLogDetail(c, formatHttpLogDetail({
    week: result.data?.week,
    courses: Array.isArray(result.data?.courses) ? result.data.courses.length : undefined,
    cache: requestMeta.cache,
    refresh: forceRefresh ? true : undefined,
    fallback: requestMeta.fallback,
    source: result._meta.source && result._meta.source !== primarySource ? result._meta.source : undefined,
    lookup: requestMeta.lookup && requestMeta.lookup !== 'weekly' ? requestMeta.lookup : undefined,
    promoted: requestMeta.promotedFrom ? 'legacy' : undefined,
  }));
}
