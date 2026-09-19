/**
 * [INPUT]: 依赖 GradeApplicationService、默认 Academic runtime、hash 与 SchoolAccess 具名成绩操作
 * [OUTPUT]: 对外提供兼容静态 GradeService
 * [POS]: academic 的 Grades composition root，唯一负责成绩 application 与 infrastructure 装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { GradeApplicationService } from './application/grade-service';
import { defaultAcademicRuntimePorts } from './infrastructure/runtime';
import { buildGradeCacheKey } from './infrastructure/grade-cache-key';
import { runtimeConfig } from '../../runtime-config';
import { schoolAccess } from '../campus-integrations/school-access/school-access';

const gradeApplication = new GradeApplicationService({
  ...defaultAcademicRuntimePorts,
  buildCacheKey: buildGradeCacheKey,
  readGrades: (userId, input) => schoolAccess.execute(userId, { name: 'jw.grades', input }, { deadlineAt: Date.now() + runtimeConfig.timeout.gradeFreshBudget }),
});

export class GradeService {
  static getGrades(...args: Parameters<GradeApplicationService['getGrades']>) {
    return gradeApplication.getGrades(...args);
  }
}
