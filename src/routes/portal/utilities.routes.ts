/**
 * [INPUT]: 依赖 Hono、ElectricityService 与统一 success 包装
 * [OUTPUT]: 默认导出 /api/utilities/electricity 只读路由
 * [POS]: routes/portal 的电费 HTTP 适配器，只传递用户身份和显式 refresh，不承载明细、水费或缴费写能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { ElectricityService } from '../../modules/campus-integrations/mobile-yxt/electricity-service';
import { success } from '../../utils/response';

const utilities = new Hono();

utilities.get('/electricity', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const forceRefresh = c.req.query('refresh') === 'true';
  const result = await ElectricityService.getAccount(userId, studentId, forceRefresh);
  return success(c, result.data, result._meta);
});

export default utilities;
