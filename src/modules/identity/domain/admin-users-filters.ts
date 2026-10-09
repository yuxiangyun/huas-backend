import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingDate, startOfBeijingDay } from '../../../utils/time';
import type { IdentityAdminUsersFilters } from './operations-query';

const TIME_FIELDS = ['lastActiveAt', 'lastLoginAt', 'createdAt'] as const;
const TIME_RANGES = ['all', 'today', '7d', '30d', 'before7d', 'before30d', 'custom'] as const;
const DAY_MS = 86_400_000;

function option<Value extends string>(value: string | undefined, values: readonly Value[], fallback: Value, field: string): Value {
  if (value === undefined || value === '') return fallback;
  const found = values.find((candidate) => candidate === value);
  if (!found) throw new AppError(ErrorCode.PARAM_ERROR, `${field} 不合法`);
  return found;
}

function dateStart(value: string): number {
  const date = new Date(`${value}T00:00:00.000+08:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || beijingDate(date) !== value) {
    throw new AppError(ErrorCode.PARAM_ERROR, '日期须为有效的 YYYY-MM-DD');
  }
  return date.getTime();
}

export function parseAdminUsersFilters(query: Partial<Record<keyof IdentityAdminUsersFilters, string>>): IdentityAdminUsersFilters {
  const grade = query.grade?.trim() || '';
  if (grade && !/^(19|20)\d{2}$/.test(grade)) throw new AppError(ErrorCode.PARAM_ERROR, '年级不合法');
  const filters: IdentityAdminUsersFilters = {
    search: query.search?.trim() || '', className: query.className?.trim() || '', grade,
    timeField: option(query.timeField, TIME_FIELDS, 'lastActiveAt', 'timeField'),
    timeRange: option(query.timeRange, TIME_RANGES, 'all', 'timeRange'),
    from: query.from?.trim() || '', to: query.to?.trim() || '',
    sortBy: option(query.sortBy, TIME_FIELDS, 'lastActiveAt', 'sortBy'),
    sortOrder: option(query.sortOrder, ['asc', 'desc'], 'desc', 'sortOrder'),
  };
  if (filters.timeRange === 'custom') {
    if (filters.from) dateStart(filters.from);
    if (filters.to) dateStart(filters.to);
    if (filters.from && filters.to && filters.from > filters.to) {
      throw new AppError(ErrorCode.PARAM_ERROR, '开始日期不能晚于结束日期');
    }
    if (!filters.from && !filters.to) throw new AppError(ErrorCode.PARAM_ERROR, '自定义范围至少填写一个日期');
  } else {
    filters.from = ''; filters.to = '';
  }
  return filters;
}

/** 半开区间 [fromMs, toMs)，自定义结束日期覆盖完整北京日。 */
export function adminUsersTimeWindow(filters: IdentityAdminUsersFilters, now: Date): { fromMs?: number; toMs?: number } {
  switch (filters.timeRange) {
    case 'today': return { fromMs: startOfBeijingDay(now).getTime() };
    case '7d': return { fromMs: now.getTime() - 7 * DAY_MS };
    case '30d': return { fromMs: now.getTime() - 30 * DAY_MS };
    case 'before7d': return { toMs: now.getTime() - 7 * DAY_MS };
    case 'before30d': return { toMs: now.getTime() - 30 * DAY_MS };
    case 'custom': return {
      fromMs: filters.from ? dateStart(filters.from) : undefined,
      toMs: filters.to ? dateStart(filters.to) + DAY_MS : undefined,
    };
    default: return {};
  }
}
