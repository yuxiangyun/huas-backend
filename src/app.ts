/**
 * [INPUT]: 依赖 Hono、注入的路由装配、媒体读取端口、全局错误/日志中间件与运行指标
 * [OUTPUT]: 对外提供 createApp(dependencies)，构造不监听端口的完整 HTTP 应用
 * [POS]: src 的 HTTP 应用工厂，把可测试协议装配与 index.ts 的进程生命周期彻底分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { resolve, sep } from 'node:path';
import { onAppError } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
import { runtimeMetrics } from './runtime/runtime-metrics';
import { Logger } from './utils/logger';

export interface AppMediaEndpoint {
  basePath: string;
  cacheControl: string;
  getFile(requestPath: string): Promise<ReturnType<typeof Bun.file> | null>;
}

export interface AppDependencies {
  registerRoutes(app: Hono): void;
  metricsRoutes: Hono;
  media: readonly AppMediaEndpoint[];
}

export interface CreateAppOptions {
  development?: boolean;
  appRoot?: string;
}

function fileResponse(file: ReturnType<typeof Bun.file>, cacheControl: string) {
  return new Response(file, {
    headers: {
      'Cache-Control': cacheControl,
      'Content-Type': file.type || 'application/octet-stream',
    },
  });
}

export function createApp(dependencies: AppDependencies, options: CreateAppOptions = {}) {
  const app = new Hono();
  const development = options.development ?? process.env.NODE_ENV !== 'production';
  const appRoot = options.appRoot ?? resolve(import.meta.dir, '..');
  const webDistRoot = resolve(appRoot, 'web', 'dist');
  const publicRoot = resolve(appRoot, 'public');

  async function resolveWebDistFile(requestPath: string) {
    const relativePath = requestPath.replace(/^\/m\/?/, '') || 'index.html';
    const absolutePath = resolve(webDistRoot, relativePath);
    if (absolutePath !== webDistRoot && !absolutePath.startsWith(`${webDistRoot}${sep}`)) return null;
    const file = Bun.file(absolutePath);
    return await file.exists() ? file : null;
  }

  async function serveWebIndex(c: Context) {
    const file = await resolveWebDistFile('/m/index.html');
    return file ? fileResponse(file, 'no-store') : c.notFound();
  }

  app.onError((error, context) => {
    runtimeMetrics.recordSqliteBusyError(error);
    return onAppError(error, context);
  });

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

  for (const endpoint of dependencies.media) {
    app.get(`${endpoint.basePath}/*`, async (c) => {
      const file = await endpoint.getFile(c.req.path);
      return file ? fileResponse(file, endpoint.cacheControl) : c.notFound();
    });
  }

  app.get('/m', serveWebIndex);
  app.get('/m/', serveWebIndex);
  app.get('/m/*', async (c) => {
    const pathAfterBase = c.req.path.replace(/^\/m\/?/, '');
    if (pathAfterBase.includes('.')) {
      const file = await resolveWebDistFile(c.req.path);
      return file ? fileResponse(file, 'public, max-age=31536000, immutable') : c.notFound();
    }
    return serveWebIndex(c);
  });

  app.route('/metrics', dependencies.metricsRoutes);
  dependencies.registerRoutes(app);

  if (development) {
    app.use('/*', serveStatic({ root: publicRoot }));
    app.get('/', (c) => c.redirect('/index.html'));
    Logger.server('开发模式: 测试页已启用 /index.html');
  }

  return app;
}
