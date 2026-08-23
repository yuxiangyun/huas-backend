/**
 * [INPUT]: 依赖 Hono、旧余额专属 Academic refresh 限流、既有 ECardService、ECardOverviewService、ErrorCode 与 response 包装
 * [OUTPUT]: 默认导出兼容 /api/ecard 余额与 /api/ecard/overview 单月账单路由，overview 含子源 availability/freshness
 * [POS]: routes/portal 的一卡通 HTTP 适配器，原余额合同保持不变，overview 只解析单月与显式刷新输入并透传聚合事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { ECardService } from '../../services/portal/ecard-service';
import { success, error } from '../../utils/response';
import { ErrorCode } from '../../utils/errors';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { ECardOverviewService } from '../../modules/campus-integrations/mobile-yxt/ecard-overview-service';

const ecard = new Hono();

// 旧余额合同继续沿用 Academic refresh 桶；overview 在应用层使用独立 mobile-yxt miss/refresh 配额。
ecard.use('/', academicRefreshRateLimitMiddleware);

ecard.get('/overview', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const month = c.req.query('month');
  const forceRefresh = c.req.query('refresh') === 'true';
  return success(
    c,
    await ECardOverviewService.getOverview(userId, studentId, month, forceRefresh),
  );
});

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
