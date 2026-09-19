/**
 * [INPUT]: 依赖固定 JW 空教室端点、既有纯解析器与统一目标读取
 * [OUTPUT]: 对外提供内部楼栋和空闲教室具名操作，保持服务账号查询所需的同会话协议
 * [POS]: SchoolAccess 的空教室只读协议；参数校验、服务账号选择与用户审计留在 Academic
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { JW_SJMS_VALUE, config } from '../../../config';
import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingDate, beijingIsoString } from '../../../utils/time';
import { URLS } from '../endpoints';
import { HttpClient } from '../http/http-client';
import { ClassroomFreeParser, type ClassroomBuilding, type FreeClassroom } from '../jw/parsers/classroom-free-parser';
import { executeBaseRead } from './base-read';
import type { SchoolRequestContext } from './request-executor';
export type ClassroomCampusId = 'A' | 'B';
export interface ClassroomReadQuery { campusId: ClassroomCampusId; buildingId: string; week?: number; weekday?: number; startSection: number; endSection: number }

function currentBeijingWeekday(): number {
  const parsed = new Date(`${beijingDate()}T12:00:00.000+08:00`);
  const weekday = parsed.getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function twoDigit(value: number): string {
  return String(value).padStart(2, '0');
}

function classroomUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function currentWeekError(): AppError {
  return new AppError(ErrorCode.INTERNAL_ERROR, '无法从教务系统解析当前周，请指定 week 和 weekday');
}

async function fetchCurrentTerm(client: Pick<HttpClient, 'request'>): Promise<string> {
  const res = await client.request(URLS.classroomQuery, {
    method: 'GET',
    timeout: config.timeout.business,
  });
  const term = ClassroomFreeParser.parseCurrentTerm(await res.text());
  if (!term) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, '无法从教务系统解析当前学期');
  }
  return term;
}

async function fetchBuildings(client: Pick<HttpClient, 'request'>, campusId: ClassroomCampusId): Promise<ClassroomBuilding[]> {
  const url = classroomUrl(URLS.classroomProcessAjax, {
    xqid: campusId,
    requestType: 'jxl',
  });
  const res = await client.request(url, {
    method: 'GET',
    headers: { Referer: URLS.classroomQuery },
    timeout: config.timeout.business,
  });
  return ClassroomFreeParser.parseBuildings(await res.text(), campusId);
}

async function resolveDefaultWeek(client: Pick<HttpClient, 'request'>): Promise<number> {
  const res = await client.request(URLS.jwMainNew, {
    method: 'GET',
    timeout: config.timeout.business,
  });
  const week = ClassroomFreeParser.parseCurrentWeek(await res.text());
  if (!week) throw currentWeekError();
  return week;
}

function buildFreeQueryBody(term: string, query: ClassroomReadQuery & { week: number; weekday: number }): URLSearchParams {
  const params = new URLSearchParams();
  params.set('typewhere', 'jszq');
  params.set('gnq_mh', '');
  params.set('jsmc_mh', '');
  params.set('syjs0601id', '');
  params.set('jxqbh', '');
  params.set('jslx', '');
  params.set('jsbh', '');
  params.set('bjfh', '>=');
  params.set('rnrs', '0');
  params.set('jszt', '8');
  params.set('kbjcmsid', JW_SJMS_VALUE);
  params.set('xnxqh', term);
  params.set('xqbh', query.campusId);
  params.set('jxlbh', query.buildingId);
  params.set('zc', String(query.week));
  params.set('zc2', String(query.week));
  params.set('xq', String(query.weekday));
  params.set('xq2', String(query.weekday));
  params.set('jc', twoDigit(query.startSection));
  params.set('jc2', twoDigit(query.endSection));
  return params;
}

export function readClassroomBuildings(userId: number, input: { campusId: ClassroomCampusId }, context: SchoolRequestContext) {
  const { campusId } = input;
  return executeBaseRead(userId, 'jw_session', context, async ({ client }) => {
      const term = await fetchCurrentTerm(client);
      const buildings = await fetchBuildings(client, campusId);
      return {
        term,
        campusId,
        campusName: ClassroomFreeParser.campusName(campusId),
        sectionModeId: JW_SJMS_VALUE,
        buildings,
      };
  });
}
export function readFreeClassrooms(userId: number, normalized: ClassroomReadQuery, context: SchoolRequestContext) {
  return executeBaseRead(userId, 'jw_session', context, async ({ client }) => {
      const term = await fetchCurrentTerm(client);
      const buildings = await fetchBuildings(client, normalized.campusId);
      const building = buildings.find((item) => item.buildingId === normalized.buildingId);
      if (!building) {
        throw new AppError(ErrorCode.PARAM_ERROR, 'buildingId 无效或已隐藏');
      }

      const week = normalized.week ?? await resolveDefaultWeek(client);
      const weekday = normalized.weekday ?? currentBeijingWeekday();

      const res = await client.request(URLS.classroomQuery2, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: URLS.classroomQuery,
        },
        body: buildFreeQueryBody(term, { ...normalized, week, weekday }),
        timeout: config.timeout.business,
      });
      const rooms: FreeClassroom[] = ClassroomFreeParser.parseFreeRooms(await res.text());

      return {
        term,
        campusId: normalized.campusId,
        campusName: ClassroomFreeParser.campusName(normalized.campusId),
        buildingId: normalized.buildingId,
        buildingName: building.buildingName,
        week,
        weekday,
        startSection: normalized.startSection,
        endSection: normalized.endSection,
        rooms,
        queriedAt: beijingIsoString(),
        sourceNote: '教务系统显示完全空闲',
      };
  });
}
