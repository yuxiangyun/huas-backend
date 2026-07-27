/**
 * [INPUT]: 依赖 Hono/Bun server、全局中间件、路由装配、数据库、媒体、静态资源、运行指标与关闭 hooks
 * [OUTPUT]: 启动 HTTP 服务，挂载 /api、/auth、/health、/metrics、/m、/media，执行定时清理与有界关闭 flush
 * [POS]: src 的进程入口，连接配置、数据库、路由、中间件、静态托管、运行观测和优雅停机
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { resolve, sep } from 'node:path';
import { initDatabase } from './db';
import { registerRoutes } from './routes';
import { onAppError } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
import { CredentialManager } from './auth/credential-manager';
import { CacheService } from './modules/cache/cache-service';
import { config } from './config';
import { Logger } from './utils/logger';
import { serverState } from './runtime/server-state';
import { runtimeMetrics } from './runtime/runtime-metrics';
import { flushShutdownHooks, registerShutdownFlushHook } from './runtime/shutdown-hooks';
import metricsRoutes from './modules/operations/http/metrics.routes';
import { AnalyticsService } from './modules/operations/infrastructure/analytics-service';
import { configureRefreshFallbackObservers } from './services/infra/refresh-fallback';
import { configureHttpClientObservers } from './modules/campus-integrations/http/http-client';
import {
  DiscoverMediaService,
  DISCOVER_MEDIA_CACHE_CONTROL,
} from './services/discover/media-service';
import {
  TreeholeAvatarMediaService,
  TREEHOLE_AVATAR_CACHE_CONTROL,
} from './services/treehole/treehole-avatar-media-service';

const app = new Hono();
const isDev = process.env.NODE_ENV !== 'production';
const appRoot = resolve(import.meta.dir, '..');
const webDistRoot = resolve(appRoot, 'web', 'dist');
const publicRoot = resolve(appRoot, 'public');

registerShutdownFlushHook('analytics', async () => {
  const result = await AnalyticsService.shutdown();
  if (!result.success) Logger.warn('Shutdown', 'analytics shutdown flush returned success=false');
});

AnalyticsService.configureFlushFailureObserver(() => {
  runtimeMetrics.recordAnalyticsFlushFailure();
});

CacheService.configureObservers({
  recordAccess: (outcome) => runtimeMetrics.recordCache(outcome),
  recordSingleflightMerge: () => runtimeMetrics.recordSingleflightMerge(),
});

configureRefreshFallbackObservers({
  recordFallback: () => runtimeMetrics.recordFallback(),
});

configureHttpClientObservers({
  recordOutcome: (outcome) => runtimeMetrics.recordUpstream(outcome),
});

function toFileResponse(file: ReturnType<typeof Bun.file>, cacheControl: string) {
  return new Response(file, {
    headers: {
      'Cache-Control': cacheControl,
      'Content-Type': file.type || 'application/octet-stream',
    },
  });
}

async function resolveWebDistFile(requestPath: string) {
  const relativePath = requestPath.replace(/^\/m\/?/, '') || 'index.html';
  const absolutePath = resolve(webDistRoot, relativePath);

  if (absolutePath !== webDistRoot && !absolutePath.startsWith(`${webDistRoot}${sep}`)) {
    return null;
  }

  const file = Bun.file(absolutePath);
  if (!(await file.exists())) return null;
  return file;
}

async function serveWebIndex(c: Context) {
  const file = await resolveWebDistFile('/m/index.html');
  if (!file) return c.notFound();
  return toFileResponse(file, 'no-store');
}

// Initialize database
initDatabase();

// Global error handler (catches all errors including sub-apps)
app.onError((error, context) => {
  runtimeMetrics.recordSqliteBusyError(error);
  return onAppError(error, context);
});

// Global middleware
app.use('*', cors());
app.use('*', async (c, next) => {
  const startedAt = performance.now();
  try {
    await next();
  } finally {
    runtimeMetrics.recordHttpRequest(c.req.method, c.res.status, performance.now() - startedAt);
  }
});
app.use('*', loggingMiddleware);

app.get(`${config.discover.mediaBasePath}/*`, async (c) => {
  const file = await DiscoverMediaService.getPublicFile(c.req.path);
  if (!file) return c.notFound();

  return new Response(file, {
    headers: {
      'Cache-Control': DISCOVER_MEDIA_CACHE_CONTROL,
      'Content-Type': file.type || 'application/octet-stream',
    },
  });
});

app.get(`${config.treehole.avatarMediaBasePath}/*`, async (c) => {
  const file = await TreeholeAvatarMediaService.getPublicFile(c.req.path);
  if (!file) return c.notFound();

  return new Response(file, {
    headers: {
      'Cache-Control': TREEHOLE_AVATAR_CACHE_CONTROL,
      'Content-Type': file.type || 'application/octet-stream',
    },
  });
});

app.get('/m', serveWebIndex);
app.get('/m/', serveWebIndex);
app.get('/m/*', async (c) => {
  const requestPath = c.req.path;
  const pathAfterBase = requestPath.replace(/^\/m\/?/, '');
  const looksLikeAsset = pathAfterBase.includes('.');

  if (looksLikeAsset) {
    const file = await resolveWebDistFile(requestPath);
    if (!file) return c.notFound();
    return toFileResponse(file, 'public, max-age=31536000, immutable');
  }

  return serveWebIndex(c);
});

// Register all routes
app.route('/metrics', metricsRoutes);
registerRoutes(app);

// Dev-only: API test page
if (isDev) {
  app.use('/*', serveStatic({ root: './public' }));
  app.get('/', (c) => c.redirect('/index.html'));
  Logger.server('开发模式: 测试页已启用 /index.html');
}

// Periodic cleanup
const cleanupTimer = setInterval(async () => {
  try {
    await CredentialManager.cleanupExpired();
    await CacheService.cleanupExpired();
    Logger.server('定时清理完成');
  } catch (e: any) {
    Logger.error('Cleanup', '定时清理失败', e);
  }
}, config.cleanupInterval);

// Start server
const port = config.port;
Logger.serverBanner(port, isDev ? 'development' : 'production');

const server = Bun.serve({
  port,
  hostname: '0.0.0.0',
  idleTimeout: config.server.idleTimeoutSeconds,
  fetch: app.fetch,
});

serverState.markReady();
Logger.serverReady(port);

let shutdownPromise: Promise<void> | null = null;

async function gracefulShutdown(signal: string) {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    serverState.beginShutdown(signal);
    clearInterval(cleanupTimer);
    Logger.server(`graceful shutdown requested signal=${signal}`);

    try {
      await server.stop();
      Logger.server(`server stopped signal=${signal}`);
      const flushResults = await flushShutdownHooks();
      for (const result of flushResults) {
        if (!result.ok) Logger.warn('Shutdown', `flush failed name=${result.name}`, result.error);
      }
      process.exit(0);
    } catch (error) {
      Logger.error('Shutdown', `graceful shutdown failed signal=${signal}`, error);
      process.exit(1);
    }
  })();

  return shutdownPromise;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void gracefulShutdown(signal);
  });
}
