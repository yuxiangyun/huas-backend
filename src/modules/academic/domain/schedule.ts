/**
 * [INPUT]: 依赖共享 CacheMeta 类型描述缓存观测字段
 * [OUTPUT]: 对外提供课表来源、范围不支持错误、缓存状态、查询追踪与三源结果领域契约
 * [POS]: academic/domain 的课表稳定语言，隔离 application 与 HTTP 路由的内部实现差异
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CacheMeta } from '../../../types';

export type ScheduleSource = 'mobile-jw' | 'jw' | 'portal';
export type ScheduleCacheState = 'hit' | 'miss' | 'bypass' | 'fallback';
export type ScheduleLookup = 'weekly' | 'legacy' | 'range';

/** 来源能力不覆盖本次查询，不代表学校尚未公布课表。 */
export class ScheduleSourceUnsupportedError extends Error {
  constructor() {
    super('SCHEDULE_SOURCE_UNSUPPORTED');
  }
}

export interface ScheduleRequestMeta {
  queryDate: string;
  cacheKey: string;
  cache: ScheduleCacheState;
  weekStartDate?: string;
  startDate?: string;
  endDate?: string;
  fallback?: ScheduleSource | 'stale';
  lookup?: ScheduleLookup;
  promotedFrom?: string;
}

export interface ScheduleFacadeResult {
  data: any;
  _meta: CacheMeta;
  _request: ScheduleRequestMeta;
}
