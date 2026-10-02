/**
 * [INPUT]: 依赖只读 schema 校验、应用/跨模块组合工厂、Bun.serve、周期/完整后台任务、学校恢复收尾与关闭 hooks
 * [OUTPUT]: 启动已校验 schema 的 HTTP 进程，协调启动/信号竞态，并停止接入、收尾任务、flush 日志与关闭数据库
 * [POS]: src 的纯进程入口，不构造路由、不执行 migration、不拥有业务模块实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { closeDatabase, assertConfiguredDatabaseSchemaCurrent } from './db';
import { config } from './config';
import { serverState } from './runtime/server-state';
import { flushShutdownHooks } from './runtime/shutdown-hooks';
import { drainBackgroundTasks } from './runtime/background-tasks';
import { Logger } from './utils/logger';

serverState.markStarting();

let server: ReturnType<typeof Bun.serve> | null = null;
let startupPromise: Promise<void> | null = null;
let shutdownPromise: Promise<void> | null = null;
let shutdownRequested = false;
let requestedExitCode = 0;
let stopPeriodicTasks: () => Promise<void> = async () => undefined;
let drainSchoolRecoveries: () => Promise<void> = async () => undefined;
let flushStartupAnalytics: () => Promise<void> = async () => undefined;
let disposeComposition: () => void = () => undefined;

async function cleanupStage(name: string, cleanup: () => void | Promise<unknown>): Promise<void> {
  try {
    await cleanup();
  } catch (error) {
    requestedExitCode = 1;
    Logger.error('Shutdown', `cleanup failed name=${name}`, error);
  }
}

async function gracefulShutdown(signal: string, exitCode = 0): Promise<void> {
  requestedExitCode = Math.max(requestedExitCode, exitCode);
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    shutdownRequested = true;
    serverState.beginShutdown(signal);
    Logger.server(`graceful shutdown requested signal=${signal}`);

    // 先停止已有 HTTP 接入，不让周期任务收尾期间继续产生新请求。
    const stopHttp = cleanupStage('http', async () => {
      const activeServer = server;
      if (activeServer) {
        await activeServer.stop();
        Logger.server(`server stopped signal=${signal}`);
      }
    });

    // start 不等待 shutdown；imports 完成后看到 shutdownRequested 就不再装配或监听。
    // 先等启动 settle，才能使用它最终取得的资源清理函数，且不会在关库后继续启动。
    if (startupPromise) {
      const [startup] = await Promise.allSettled([startupPromise]);
      if (startup?.status === 'rejected') requestedExitCode = 1;
    }
    await Promise.all([stopHttp, cleanupStage('periodic-tasks', stopPeriodicTasks)]);
    await cleanupStage('background-tasks', drainBackgroundTasks);
    await cleanupStage('school-recoveries', drainSchoolRecoveries);
    await cleanupStage('startup-analytics', flushStartupAnalytics);
    await cleanupStage('flush-hooks', async () => {
      const flushResults = await flushShutdownHooks();
      for (const result of flushResults) {
        if (!result.ok) Logger.warn('Shutdown', `flush failed name=${result.name}`, result.error);
      }
    });
    await cleanupStage('composition', disposeComposition);
    await cleanupStage('logger', async () => {
      const result = await Logger.flush();
      if (!result.ok) Logger.warn('Shutdown', 'logger flush failed', result.error);
    });
    await cleanupStage('database', closeDatabase);
    process.exit(requestedExitCode);
  })();

  return shutdownPromise;
}

async function start(): Promise<void> {
  // 应用进程只有结构校验权；任何 migration 必须由显式部署命令先完成。
  assertConfiguredDatabaseSchemaCurrent();

  // 首个 import 失败不能让关闭提前越过其他仍在初始化的模块。
  const [appModule, compositionModule, schoolModule, analyticsModule] = await Promise.allSettled([
    import('./app'),
    import('./composition'),
    import('./modules/campus-integrations/school-access/school-access'),
    import('./modules/operations/infrastructure/analytics-service'),
  ]);
  if (schoolModule.status === 'fulfilled') {
    drainSchoolRecoveries = () => schoolModule.value.schoolAccessMaintenance.drainRecoveries();
  }
  if (analyticsModule.status === 'fulfilled') {
    // 模块导入已创建 timer；组合根尚未接管其 shutdown hook 时由入口负责收尾。
    flushStartupAnalytics = async () => {
      const result = await analyticsModule.value.AnalyticsService.shutdown();
      if (!result.success) Logger.warn('Shutdown', 'startup analytics flush returned success=false');
    };
  }
  if (appModule.status === 'rejected') throw appModule.reason;
  if (compositionModule.status === 'rejected') throw compositionModule.reason;
  if (schoolModule.status === 'rejected') throw schoolModule.reason;
  if (analyticsModule.status === 'rejected') throw analyticsModule.reason;
  if (shutdownRequested) return;
  const composition = compositionModule.value.createApplicationComposition();
  disposeComposition = composition.dispose;
  stopPeriodicTasks = () => composition.periodicTasks.stop();
  flushStartupAnalytics = async () => undefined; // 已交给组合根登记的 analytics hook。
  const app = appModule.value.createApp(composition.app);

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
  startupPromise = start();
  await startupPromise;
} catch (error) {
  Logger.error('Startup', '启动失败，schema 未就绪或应用装配异常', error);
  await gracefulShutdown('STARTUP_FAILURE', 1);
}
