/**
 * [INPUT]: 依赖 Hono、Operations system adapter、runtime readiness 与北京时间格式化工具
 * [OUTPUT]: 默认导出 `/health`、`/health/live`、`/health/ready` Hono 路由
 * [POS]: operations/http 的健康检查适配器，保留旧根响应并分离进程存活与本地依赖就绪语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { beijingIsoString } from '../../../utils/time';
import { readinessProbe } from '../../../runtime/readiness';
import { systemOperations } from '../composition';

const health = new Hono();

health.get('/live', (c) => {
  const status = systemOperations.healthStatus();
  return c.json({
    success: true,
    data: {
      status: 'live',
      uptime: process.uptime(),
      deploySlot: status.deploySlot,
    },
  });
});

health.get('/ready', (c) => {
  const result = readinessProbe.check();
  return c.json({ success: result.ready, data: result }, result.ready ? 200 : 503);
});

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
