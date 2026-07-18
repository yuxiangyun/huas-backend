/**
 * [INPUT]: 依赖 Hono、academicRefreshRateLimitMiddleware、GradeService 与 response.success
 * [OUTPUT]: 默认导出 /api/grades 路由
 * [POS]: routes/academic 的成绩 HTTP 适配器，只解析查询与 refresh 参数并转交用户身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { GradeService } from '../../services/academic/grade-service';
import { success } from '../../utils/response';

const grades = new Hono();

grades.use('*', academicRefreshRateLimitMiddleware);

grades.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const name = c.get('name');
  const query = c.req.query();
  const forceRefresh = c.req.query('refresh') === 'true';

  const result = await GradeService.getGrades(userId, studentId, query, forceRefresh, name);
  return success(c, result.data, result._meta);
});

export default grades;
