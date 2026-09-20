/**
 * [INPUT]: 依赖 SchoolAccess 具名只读结果类型 与共享 AppError/ErrorCode 表达参数和服务错误契约
 * [OUTPUT]: 对外提供空教室查询/actor 契约、纯规范化规则与服务账号查询端口
 * [POS]: academic/domain 的空教室业务边界，区分请求用户审计身份和上游服务账号身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import type { SchoolOperationOutput } from '../../campus-integrations/school-access/school-access';

export type CampusId = 'A' | 'B';

export interface FreeQuery {
  campusId?: string;
  buildingId?: string;
  week?: string;
  weekday?: string;
  startSection?: string;
  endSection?: string;
}

export interface NormalizedFreeQuery {
  campusId: CampusId;
  buildingId: string;
  week?: number;
  weekday?: number;
  startSection: number;
  endSection: number;
}

export interface ClassroomQueryActor {
  userId: number;
  studentId: string;
  name?: string;
}

export interface ClassroomApplicationPorts {
  readBuildings(userId: number, input: { campusId: CampusId }): Promise<SchoolOperationOutput<'jw.classrooms.buildings'>>;
  readFreeRooms(userId: number, input: NormalizedFreeQuery): Promise<SchoolOperationOutput<'jw.classrooms.free'>>;
  resolveServiceAccountUserId(): Promise<number>;
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

export function normalizeCampusId(raw: string | undefined): CampusId {
  const campusId = (raw ?? '').trim();
  if (campusId !== 'A' && campusId !== 'B') {
    throw new AppError(ErrorCode.PARAM_ERROR, '校区选择无效，请重新选择校区');
  }
  return campusId;
}

function normalizeBuildingId(raw: string | undefined): string {
  const buildingId = (raw ?? '').trim();
  if (!buildingId) {
    throw new AppError(ErrorCode.PARAM_ERROR, '请选择教学楼');
  }
  return buildingId;
}

export function normalizeFreeQuery(query: FreeQuery): NormalizedFreeQuery {
  const hasWeek = (query.week ?? '').trim() !== '';
  const hasWeekday = (query.weekday ?? '').trim() !== '';
  if (hasWeek !== hasWeekday) {
    throw new AppError(ErrorCode.PARAM_ERROR, '请同时选择教学周和星期');
  }

  const startSection = parseIntParam(query.startSection, '开始节次', 1, 30);
  const endSection = parseIntParam(query.endSection, '结束节次', 1, 30);
  if (endSection < startSection) {
    throw new AppError(ErrorCode.PARAM_ERROR, '结束节次不能早于开始节次');
  }

  return {
    campusId: normalizeCampusId(query.campusId),
    buildingId: normalizeBuildingId(query.buildingId),
    week: hasWeek ? parseIntParam(query.week, '教学周', 1, 30) : undefined,
    weekday: hasWeekday ? parseIntParam(query.weekday, '星期', 1, 7) : undefined,
    startSection,
    endSection,
  };
}
