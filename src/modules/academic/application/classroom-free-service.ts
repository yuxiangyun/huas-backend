/**
 * [INPUT]: 依赖 ClassroomApplicationPorts、canonical ClassroomFreeParser/JW 端点、config 与时间/日志工具
 * [OUTPUT]: 对外提供可注入 ClassroomApplicationPorts 的 ClassroomFreeApplicationService
 * [POS]: academic/application 的空教室用例，用户只作为审计 actor，上游查询统一使用配置化教务服务账号
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { JW_SJMS_VALUE, config } from '../../../config';
import { URLS } from '../../campus-integrations/endpoints';
import {
  ClassroomFreeParser,
  type ClassroomBuilding,
  type FreeClassroom,
} from '../../campus-integrations/jw/parsers/classroom-free-parser';
import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingDate, beijingIsoString } from '../../../utils/time';
import { Logger } from '../../../utils/logger';
import {
  normalizeCampusId,
  normalizeFreeQuery,
  type CampusId,
  type ClassroomApplicationPorts,
  type ClassroomQueryActor,
  type FreeQuery,
  type NormalizedFreeQuery,
} from '../domain/classroom';
import type { AcademicHttpClient } from '../domain/ports';

const QUERY_META = { cached: false, source: 'jw', upstreamAccount: 'admin' } as const;

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

async function fetchCurrentTerm(client: AcademicHttpClient): Promise<string> {
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

async function fetchBuildings(client: AcademicHttpClient, campusId: CampusId): Promise<ClassroomBuilding[]> {
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

async function resolveDefaultWeek(client: AcademicHttpClient): Promise<number> {
  const res = await client.request(URLS.jwMainNew, {
    method: 'GET',
    timeout: config.timeout.business,
  });
  const week = ClassroomFreeParser.parseCurrentWeek(await res.text());
  if (!week) throw currentWeekError();
  return week;
}

function buildFreeQueryBody(term: string, query: NormalizedFreeQuery & { week: number; weekday: number }): URLSearchParams {
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

export class ClassroomFreeApplicationService {
  constructor(private readonly ports: ClassroomApplicationPorts) {}

  async getBuildings(rawCampusId: string | undefined, actor: ClassroomQueryActor) {
    const campusId = normalizeCampusId(rawCampusId);
    const adminUserId = await this.ports.resolveServiceAccountUserId();

    const data = await this.ports.upstream(adminUserId, 'jw', async ({ client }) => {
      const term = await fetchCurrentTerm(client);
      const buildings = await fetchBuildings(client, campusId);
      Logger.operation(
        'ClassroomFreeQuery',
        'buildings',
        actor.studentId,
        actor.name,
        `ClassroomFreeQuery action=buildings actor=${actor.studentId} actorName=${actor.name || ''} actorUserId=${actor.userId} upstreamAccount=admin campus=${campusId} term=${term} buildings=${buildings.length}`
      );
      return {
        term,
        campusId,
        campusName: ClassroomFreeParser.campusName(campusId),
        sectionModeId: JW_SJMS_VALUE,
        buildings,
      };
    });

    return { data, _meta: QUERY_META };
  }

  async getFreeRooms(query: FreeQuery, actor: ClassroomQueryActor) {
    const normalized = normalizeFreeQuery(query);
    const adminUserId = await this.ports.resolveServiceAccountUserId();

    const data = await this.ports.upstream(adminUserId, 'jw', async ({ client }) => {
      const term = await fetchCurrentTerm(client);
      const buildings = await fetchBuildings(client, normalized.campusId);
      const building = buildings.find((item) => item.buildingId === normalized.buildingId);
      if (!building) {
        throw new AppError(ErrorCode.PARAM_ERROR, 'buildingId 无效或已隐藏');
      }

      const week = normalized.week ?? await resolveDefaultWeek(client);
      const weekday = normalized.weekday ?? currentBeijingWeekday();

      Logger.operation(
        'ClassroomFreeQuery',
        'query',
        actor.studentId,
        actor.name,
        `ClassroomFreeQuery action=free actor=${actor.studentId} actorName=${actor.name || ''} actorUserId=${actor.userId} upstreamAccount=admin campus=${normalized.campusId} building=${normalized.buildingId} week=${week} weekday=${weekday} sections=${normalized.startSection}-${normalized.endSection}`
      );

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

    return { data, _meta: QUERY_META };
  }
}
