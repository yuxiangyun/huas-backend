/**
 * [INPUT]: 依赖 Hono、教务 refresh 限流、UserService、http-log、ErrorCode 与 response 成功/错误包装
 * [OUTPUT]: 默认导出 /api/user 路由
 * [POS]: routes/portal 的用户资料 HTTP 适配器，记录刷新意图并保留空数据到 502 业务错误的映射
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { UserService } from '../../services/portal/user-service';
import { success, error } from '../../utils/response';
import { ErrorCode } from '../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../utils/http-log';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';

const user = new Hono();

user.use('*', academicRefreshRateLimitMiddleware);

user.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const forceRefresh = c.req.query('refresh') === 'true';

  appendHttpLogDetail(c, formatHttpLogDetail({ refresh: forceRefresh }));
  const result = await UserService.getUserInfo(userId, studentId, forceRefresh);
  if (!result.data) {
    return error(c, ErrorCode.INTERNAL_ERROR, '统一认证中心繁忙，获取失败', 502);
  }
  return success(c, result.data, result._meta);
});

export default user;
