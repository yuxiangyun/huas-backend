/**
 * [INPUT]: 依赖 db/schema 查询服务账号，依赖 config/JW URL、upstream、ClassroomFreeParser 与时间工具
 * [OUTPUT]: 对外提供 ClassroomFreeService，读取楼栋与空教室查询结果并返回服务账号来源元信息
 * [POS]: services/academic 的空教室服务，用户只作为审计 actor，上游查询统一使用配置化教务服务账号
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../db';
import { JW_SJMS_VALUE, config } from '../../config';
import { URLS } from '../../core/url-config';
import type { HttpClient } from '../../core/http-client';
import { ClassroomFreeParser, type ClassroomBuilding, type FreeClassroom } from '../../parsers';
import { upstream } from '../infra/upstream';
import { AppError, ErrorCode } from '../../utils/errors';
import { beijingDate, beijingIsoString } from '../../utils/time';
import { Logger } from '../../utils/logger';

const QUERY_META = { cached: false, source: 'jw', upstreamAccount: 'admin' } as const;

type CampusId = 'A' | 'B';

interface FreeQuery {
  campusId?: string;
  buildingId?: string;
  week?: string;
  weekday?: string;
  startSection?: string;
  endSection?: string;
}

interface NormalizedFreeQuery {
  campusId: CampusId;
  buildingId: string;
  week?: number;
  weekday?: number;
  startSection: number;
  endSection: number;
}

interface ClassroomQueryActor {
  userId: number;
  studentId: string;
  name?: string;
}

function parseIntParam(raw: string | undefined, field: string, min: number, max: number): number {
  const value = (raw ?? '').trim();
  if (!/^\d+$/.test(value)) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${field} 参数无效`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${field} 参数应为 ${min}-${max} 的整数`);
  }

  return parsed;
}

function normalizeCampusId(raw: string | undefined): CampusId {
  const campusId = (raw ?? '').trim();
  if (campusId !== 'A' && campusId !== 'B') {
    throw new AppError(ErrorCode.PARAM_ERROR, 'campusId 参数必须为 A 或 B');
  }
  return campusId;
}

function normalizeBuildingId(raw: string | undefined): string {
  const buildingId = (raw ?? '').trim();
  if (!buildingId) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'buildingId 参数不能为空');
  }
  return buildingId;
}

function normalizeFreeQuery(query: FreeQuery): NormalizedFreeQuery {
  const hasWeek = (query.week ?? '').trim() !== '';
  const hasWeekday = (query.weekday ?? '').trim() !== '';
  if (hasWeek !== hasWeekday) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'week 和 weekday 必须同时传入');
  }

  const startSection = parseIntParam(query.startSection, 'startSection', 1, 30);
  const endSection = parseIntParam(query.endSection, 'endSection', 1, 30);
  if (endSection < startSection) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'endSection 必须大于或等于 startSection');
  }

  return {
    campusId: normalizeCampusId(query.campusId),
    buildingId: normalizeBuildingId(query.buildingId),
    week: hasWeek ? parseIntParam(query.week, 'week', 1, 30) : undefined,
    weekday: hasWeekday ? parseIntParam(query.weekday, 'weekday', 1, 7) : undefined,
    startSection,
    endSection,
  };
}

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

async function resolveAdminUserId(): Promise<number> {
  const adminStudentId = config.schoolService.classroomAdminStudentId;
  if (!adminStudentId) {
    throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '空教室服务账号未配置');
  }

  const db = getDb();
  const rows = await db.select({
    id: schema.users.id,
  })
    .from(schema.users)
    .where(eq(schema.users.studentId, adminStudentId))
    .limit(1);

  const userId = rows[0]?.id;
  if (!userId) {
    throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '空教室服务账号未登录或凭证已过期');
  }

  return userId;
}

async function fetchCurrentTerm(client: HttpClient): Promise<string> {
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

async function fetchBuildings(client: HttpClient, campusId: CampusId): Promise<ClassroomBuilding[]> {
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

async function resolveDefaultWeek(client: HttpClient): Promise<number> {
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

export class ClassroomFreeService {
  static get adminStudentId() {
    return config.schoolService.classroomAdminStudentId;
  }

  static async getBuildings(rawCampusId: string | undefined, actor: ClassroomQueryActor) {
    const campusId = normalizeCampusId(rawCampusId);
    const adminUserId = await resolveAdminUserId();

    const data = await upstream(adminUserId, 'jw', async ({ client }) => {
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

  static async getFreeRooms(query: FreeQuery, actor: ClassroomQueryActor) {
    const normalized = normalizeFreeQuery(query);
    const adminUserId = await resolveAdminUserId();

    const data = await upstream(adminUserId, 'jw', async ({ client }) => {
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
