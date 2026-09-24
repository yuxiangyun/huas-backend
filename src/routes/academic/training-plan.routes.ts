/**
 * [INPUT]: 依赖 Hono、教务强刷限流、Academic TrainingPlanService 与统一成功响应
 * [OUTPUT]: 默认导出受 Bearer 保护的 GET /api/training-plan 路由
 * [POS]: routes/academic 的培养方案 HTTP 适配器，仅解析 refresh 与用户身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { TrainingPlanService } from '../../modules/academic/training-plan';
import { success } from '../../utils/response';

const trainingPlan = new Hono();
trainingPlan.use('*', academicRefreshRateLimitMiddleware);

trainingPlan.get('/', async c => {
  const result = await TrainingPlanService.getTrainingPlan(
    c.get('userId'), c.get('studentId'), c.req.query('refresh') === 'true',
  );
  return success(c, result.data, result._meta);
});

export default trainingPlan;
