/**
 * [INPUT]: 依赖 Portal 三个固定端点、既有纯解析器与统一 Portal 目标读取
 * [OUTPUT]: 对外提供内部资料、余额和日期课表具名只读操作
 * [POS]: SchoolAccess 的 Portal 协议适配器；缓存、资料回写与来源编排留在业务层
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { PORTAL_HEADERS } from '../../../config';
import { URLS } from '../endpoints';
import { UserParser } from '../portal/parsers/user-parser';
import { ECardParser } from '../portal/parsers/ecard-parser';
import { PortalScheduleParser } from '../portal/parsers/portal-schedule-parser';
import { executeBaseRead } from './base-read';
import type { SchoolRequestContext } from './request-executor';

export function readPortalProfile(userId: number, _input: Record<string, never>, context: SchoolRequestContext) {
  return executeBaseRead(userId, 'portal_jwt', context, async ({ client, snapshot }) => {
    const response = await client.request(URLS.userInfo, { headers: { ...PORTAL_HEADERS, 'X-Id-Token': snapshot.value! } });
    if (!response.ok) throw new Error(`PORTAL_PROFILE_HTTP_${response.status}`);
    return UserParser.parse(await response.json());
  });
}
export function readPortalBalance(userId: number, _input: Record<string, never>, context: SchoolRequestContext) {
  return executeBaseRead(userId, 'portal_jwt', context, async ({ client, snapshot }) => {
    const response = await client.request(URLS.ecardApi, { headers: { 'X-Id-Token': snapshot.value! } });
    if (!response.ok) throw new Error(`ECARD_HTTP_${response.status}`);
    return ECardParser.parse(await response.json());
  });
}
export interface PortalScheduleInput { startDate: string; endDate: string; studentId: string; name?: string }
export function readPortalSchedule(userId: number, input: PortalScheduleInput, context: SchoolRequestContext) {
  return executeBaseRead(userId, 'portal_jwt', context, async ({ client, snapshot }) => {
    const url = new URL(URLS.portalScheduleEvents);
    url.searchParams.set('startDate', input.startDate);
    url.searchParams.set('endDate', input.endDate);
    url.searchParams.set('reqType', 'MonthView');
    url.searchParams.set('random_number', Math.random().toString());
    const response = await client.request(url.toString(), { headers: { 'X-Id-Token': snapshot.value! } });
    if (!response.ok) throw new Error(`PORTAL_SCHEDULE_HTTP_${response.status}`);
    return PortalScheduleParser.parse(await response.json(), input.startDate, input.endDate, input);
  });
}
