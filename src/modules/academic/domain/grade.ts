/**
 * [INPUT]: 依赖 AcademicRuntimePorts、共享 AppError/ErrorCode 与 具名成绩读取边界
 * [OUTPUT]: 对外提供成绩查询规范化规则、GradeApplicationPorts 与评教发现契约
 * [POS]: academic/domain 的成绩业务契约，限制缓存维度并隔离应用层和具体 hash/校园实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { IGradeList } from '../../../types';
import { AppError, ErrorCode } from '../../../utils/errors';
import type { AcademicRuntimePorts } from './ports';

const MAX_TERM_LENGTH = 32;
const MAX_KCXZ_LENGTH = 32;
const MAX_KCMC_LENGTH = 64;

export interface GradeQuery {
  term?: string;
  kcxz?: string;
  kcmc?: string;
}

export interface NormalizedGradeQuery {
  term: string;
  kcxz: string;
  kcmc: string;
}

export interface EvaluationDiscoveryResult {
  evaluationRequired: boolean;
  listUrl: string | null;
}

export interface GradeApplicationPorts extends AcademicRuntimePorts {
  buildCacheKey(studentId: string, term: string, kcxz: string, kcmc: string): string;
  readGrades(userId: number, input: NormalizedGradeQuery & { studentId: string; name?: string }): Promise<IGradeList | null>;
}

function normalizeQueryValue(raw: string | undefined, maxLength: number, fieldName: string): string {
  const normalized = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (normalized.length > maxLength) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${fieldName} 参数过长`);
  }
  return normalized;
}

export function normalizeGradeQuery(query: GradeQuery): NormalizedGradeQuery {
  return {
    term: normalizeQueryValue(query.term, MAX_TERM_LENGTH, '学期'),
    kcxz: normalizeQueryValue(query.kcxz, MAX_KCXZ_LENGTH, '课程性质'),
    kcmc: normalizeQueryValue(query.kcmc, MAX_KCMC_LENGTH, '课程名称'),
  };
}
