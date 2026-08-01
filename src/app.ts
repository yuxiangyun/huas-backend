/**
 * [INPUT]: 依赖 Hono、注入的路由装配、媒体读取端口、全局错误/日志中间件与运行指标
 * [OUTPUT]: 对外提供 createApp(dependencies)，构造含 Web 分层缓存与私有 API no-store 边界的不监听 HTTP 应用
 * [POS]: src 的 HTTP 应用工厂，把可测试协议装配、静态资源缓存语义与 index.ts 的进程生命周期彻底分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono, type Context, type Next } from 'hono';
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

const WEB_DOCUMENT_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const WEB_HASHED_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const PRIVATE_DATA_CACHE_CONTROL = 'private, no-store';

function buildWeakFileEtag(file: ReturnType<typeof Bun.file>) {
  return `W/"${file.size.toString(16)}-${file.lastModified.toString(16)}"`;
}

function matchesEtag(ifNoneMatch: string | undefined, etag: string) {
  if (!ifNoneMatch) return false;
  const normalizedEtag = etag.replace(/^W\//, '');
  return ifNoneMatch.split(',').some((candidate) => {
    const normalizedCandidate = candidate.trim().replace(/^W\//, '');
    return normalizedCandidate === '*' || normalizedCandidate === normalizedEtag;
  });
}

function isViteHashedAsset(requestPath: string) {
  if (!requestPath.startsWith('assets/')) return false;
  const fileName = requestPath.split('/').at(-1) || '';
  return /-[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9]+)+$/.test(fileName);
}

function fileResponse(
  file: ReturnType<typeof Bun.file>,
  cacheControl: string,
  options: { etag?: string } = {},
) {
  const headers = new Headers({
    'Cache-Control': cacheControl,
  });
  headers.set('Content-Type', file.type || 'application/octet-stream');
  if (options.etag) headers.set('ETag', options.etag);

  return new Response(file, {
    headers,
  });
}

function revalidatedFileResponse(c: Context, file: ReturnType<typeof Bun.file>) {
  const etag = buildWeakFileEtag(file);
  if (matchesEtag(c.req.header('If-None-Match'), etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        'Cache-Control': WEB_DOCUMENT_CACHE_CONTROL,
        ETag: etag,
      },
    });
  }

  return fileResponse(file, WEB_DOCUMENT_CACHE_CONTROL, { etag });
}

async function privateDataNoStore(c: Context, next: Next) {
  await next();
  c.header('Cache-Control', PRIVATE_DATA_CACHE_CONTROL);
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
    return file ? revalidatedFileResponse(c, file) : c.notFound();
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
  app.use('/api/*', privateDataNoStore);
  app.use('/auth/*', privateDataNoStore);

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
    const file = await resolveWebDistFile(c.req.path);
    if (file) {
      return isViteHashedAsset(pathAfterBase)
        ? fileResponse(file, WEB_HASHED_ASSET_CACHE_CONTROL)
        : revalidatedFileResponse(c, file);
    }
    if (pathAfterBase.startsWith('assets/') || pathAfterBase.includes('.')) return c.notFound();
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
