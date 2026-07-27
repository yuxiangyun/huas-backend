/**
 * [INPUT]: 依赖 Hono、Operations system adapter 与北京时间格式化工具
 * [OUTPUT]: 默认导出原 `/health` Hono 路由，返回进程状态与 SQLite 连通性
 * [POS]: operations/http 的健康检查适配器；不包含 live/ready/metrics 扩展端点
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { beijingIsoString } from '../../../utils/time';
import { systemOperations } from '../composition';

const health = new Hono();

health.get('/', (c) => {
  const status = systemOperations.healthStatus();
  if (!status.ready || status.shuttingDown) {
    return c.json({
      success: false,
      data: {
        status: status.shuttingDown ? 'shutting-down' : 'starting',
        deploySlot: status.deploySlot,
        shutdownSignal: status.shutdownSignal,
      },
    }, 503);
  }
  if (!systemOperations.databaseIsHealthy()) {
    return c.json({ success: false, data: { status: 'error', deploySlot: status.deploySlot } }, 503);
  }
  return c.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: beijingIsoString(),
      uptime: process.uptime(),
      deploySlot: status.deploySlot,
    },
  });
});

export default health;
