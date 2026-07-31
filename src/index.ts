/**
 * [INPUT]: 依赖只读 schema 校验、应用/跨模块组合工厂、Bun.serve、周期任务与关闭 hooks
 * [OUTPUT]: 启动已校验 schema 的 HTTP 进程，处理信号并按序停止任务、服务、flush 与数据库
 * [POS]: src 的纯进程入口，不构造路由、不执行 migration、不拥有业务模块实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { closeDatabase, assertConfiguredDatabaseSchemaCurrent } from './db';
import { config } from './config';
import { serverState } from './runtime/server-state';
import { flushShutdownHooks } from './runtime/shutdown-hooks';
import { Logger } from './utils/logger';

serverState.markStarting();

let server: ReturnType<typeof Bun.serve> | null = null;
let shutdownPromise: Promise<void> | null = null;
let stopPeriodicTasks: () => Promise<void> = async () => undefined;
let disposeComposition: () => void = () => undefined;

async function gracefulShutdown(signal: string, exitCode = 0): Promise<void> {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    serverState.beginShutdown(signal);
    Logger.server(`graceful shutdown requested signal=${signal}`);

    try {
      await stopPeriodicTasks();
      if (server) {
        await server.stop();
        Logger.server(`server stopped signal=${signal}`);
      }
      const flushResults = await flushShutdownHooks();
      for (const result of flushResults) {
        if (!result.ok) Logger.warn('Shutdown', `flush failed name=${result.name}`, result.error);
      }
      disposeComposition();
      closeDatabase();
      process.exit(exitCode);
    } catch (error) {
      Logger.error('Shutdown', `graceful shutdown failed signal=${signal}`, error);
      try {
        disposeComposition();
        closeDatabase();
      } finally {
        process.exit(1);
      }
    }
  })();

  return shutdownPromise;
}

async function start(): Promise<void> {
  // 应用进程只有结构校验权；任何 migration 必须由显式部署命令先完成。
  assertConfiguredDatabaseSchemaCurrent();

  const [{ createApp }, { createApplicationComposition }] = await Promise.all([
    import('./app'),
    import('./composition'),
  ]);
  const composition = createApplicationComposition();
  disposeComposition = composition.dispose;
  stopPeriodicTasks = () => composition.periodicTasks.stop();
  const app = createApp(composition.app);

  composition.periodicTasks.start();
  const isDev = process.env.NODE_ENV !== 'production';
  Logger.serverBanner(config.port, isDev ? 'development' : 'production');
  server = Bun.serve({
    port: config.port,
    hostname: '0.0.0.0',
    idleTimeout: config.server.idleTimeoutSeconds,
    fetch: app.fetch,
  });
  serverState.markReady();
  Logger.serverReady(config.port);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void gracefulShutdown(signal);
  });
}

try {
  await start();
} catch (error) {
  serverState.markStarting();
  Logger.error('Startup', '启动失败，schema 未就绪或应用装配异常', error);
  await stopPeriodicTasks();
  disposeComposition();
  closeDatabase();
  process.exit(1);
}
