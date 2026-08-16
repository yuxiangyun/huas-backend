/**
 * [INPUT]: 依赖 Hono、教务 refresh 限流、ECardService、ErrorCode 与 response 成功/错误包装
 * [OUTPUT]: 默认导出 /api/ecard 路由
 * [POS]: routes/portal 的一卡通 HTTP 适配器，保留空数据到 502 业务错误的映射
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { ECardService } from '../../services/portal/ecard-service';
import { success, error } from '../../utils/response';
import { ErrorCode } from '../../utils/errors';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';

const ecard = new Hono();

ecard.use('*', academicRefreshRateLimitMiddleware);

ecard.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const forceRefresh = c.req.query('refresh') === 'true';

  const result = await ECardService.getECard(userId, studentId, forceRefresh);
  if (!result.data) {
    return error(c, ErrorCode.INTERNAL_ERROR, '一卡通服务系统忙，请稍后重试', 502);
  }
  return success(c, result.data, result._meta);
});

export default ecard;
