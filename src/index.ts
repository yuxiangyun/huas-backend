import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { resolve, sep } from 'node:path';
import { initDatabase } from './db';
import { registerRoutes } from './routes';
import { onAppError } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
import { CredentialManager } from './auth/credential-manager';
import { CacheService } from './services/infra/cache-service';
import { config } from './config';
import { Logger } from './utils/logger';
import { adminBasicAuthMiddleware } from './middleware/admin-basic-auth.middleware';
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
const webDistRoot = resolve('./web/dist');

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
app.onError(onAppError);

// Global middleware
app.use('*', cors());
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
registerRoutes(app);

// Admin status page (protected by Basic Auth)
app.get('/status', adminBasicAuthMiddleware, async (c) => {
  const html = await Bun.file('./public/status.html').text();
  return c.html(html);
});

// Dev-only: API test page
if (isDev) {
  app.use('/*', serveStatic({ root: './public' }));
  app.get('/', (c) => c.redirect('/index.html'));
  Logger.server('开发模式: 测试页已启用 /index.html');
}

// Periodic cleanup
setInterval(async () => {
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

Bun.serve({
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
});

Logger.serverReady(port);
