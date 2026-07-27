/**
 * [INPUT]: 依赖 GradeApplicationService、默认 Academic runtime、hash 与评教发现适配器
 * [OUTPUT]: 对外提供兼容静态 GradeService
 * [POS]: academic 的 Grades composition root，唯一负责成绩 application 与 infrastructure 装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { GradeApplicationService } from './application/grade-service';
import { defaultAcademicRuntimePorts } from './infrastructure/runtime';
import { buildGradeCacheKey } from './infrastructure/grade-cache-key';
import { discoverEvaluationListUrlFromClient } from './infrastructure/evaluation-discovery';

const gradeApplication = new GradeApplicationService({
  ...defaultAcademicRuntimePorts,
  buildCacheKey: buildGradeCacheKey,
  discoverEvaluation: discoverEvaluationListUrlFromClient,
});

export class GradeService {
  static getGrades(...args: Parameters<GradeApplicationService['getGrades']>) {
    return gradeApplication.getGrades(...args);
  }
}
