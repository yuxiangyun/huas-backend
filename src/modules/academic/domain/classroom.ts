/**
 * [INPUT]: 依赖 AcademicUpstream 与共享 AppError/ErrorCode 表达参数和服务错误契约
 * [OUTPUT]: 对外提供空教室查询/actor 契约、纯规范化规则与服务账号查询端口
 * [POS]: academic/domain 的空教室业务边界，区分请求用户审计身份和上游服务账号身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import type { AcademicUpstream } from './ports';

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
  upstream: AcademicUpstream;
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

export function normalizeFreeQuery(query: FreeQuery): NormalizedFreeQuery {
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
