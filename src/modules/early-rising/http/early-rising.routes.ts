/**
 * [INPUT]: 依赖 Hono、注入的 EarlyRisingApplicationService、领域 period 校验与统一 success envelope
 * [OUTPUT]: 对外提供 createEarlyRisingRoutes(service)，映射无客户端时间字段的打卡、我的统计、有界趋势、排行榜与展示设置 API
 * [POS]: modules/early-rising/http 的 Bearer 认证后协议 adapter，只读取 userId/query 并把时间与展示裁决留给应用服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { success } from '../../../utils/response';
import type { EarlyRisingApplicationService } from '../application/early-rising-application-service';
import { parseEarlyRisingPeriod } from '../domain/early-rising';

type EarlyRisingHttpService = Pick<
  EarlyRisingApplicationService,
  'checkIn' | 'getMe' | 'getTrend' | 'getLeaderboard' | 'getClientSettings'
>;

export function createEarlyRisingRoutes(service: EarlyRisingHttpService) {
  const routes = new Hono();

  routes.post('/check-ins', async (c) => {
    return success(c, await service.checkIn(c.get('userId')));
  });

  routes.get('/me', async (c) => {
    return success(c, await service.getMe(c.get('userId')));
  });

  routes.get('/trend', async (c) => {
    return success(c, await service.getTrend(c.get('userId'), {
      month: c.req.query('month'),
      from: c.req.query('from'),
      to: c.req.query('to'),
    }));
  });

  routes.get('/leaderboard', async (c) => {
    return success(c, await service.getLeaderboard(
      c.get('userId'),
      parseEarlyRisingPeriod(c.req.query('period')),
    ));
  });

  routes.get('/settings', async (c) => {
    return success(c, await service.getClientSettings());
  });

  return routes;
}
