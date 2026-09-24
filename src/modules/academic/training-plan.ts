/**
 * [INPUT]: 依赖培养方案应用服务、默认缓存运行时与 SchoolAccess 具名 JW 双页读取
 * [OUTPUT]: 对外提供 TrainingPlanService 静态入口供 HTTP 层调用
 * [POS]: Academic 培养方案 composition root，负责端口装配而不处理 HTML 或响应包装
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { runtimeConfig } from '../../runtime-config';
import { schoolAccess } from '../campus-integrations/school-access/school-access';
import { TrainingPlanApplicationService } from './application/training-plan-service';
import { academicCache, academicRefreshFallback } from './infrastructure/cache-store';

const application = new TrainingPlanApplicationService({
  cache: academicCache,
  refreshFallback: academicRefreshFallback,
  readTrainingPlan: userId => schoolAccess.execute(userId, {
    name: 'jw.trainingPlan', input: {},
  }, { deadlineAt: Date.now() + runtimeConfig.school.totalBudgetMs }),
});

export class TrainingPlanService {
  static getTrainingPlan(...args: Parameters<TrainingPlanApplicationService['getTrainingPlan']>) {
    return application.getTrainingPlan(...args);
  }
}
