import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { initDatabase } from './db';
import { registerRoutes } from './routes';
import { onAppError } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
import { CredentialManager } from './auth/credential-manager';
import { CacheService } from './services/cache-service';
import { config } from './config';
import { Logger } from './utils/logger';

const app = new Hono();
const isDev = process.env.NODE_ENV !== 'production';

// Initialize database
initDatabase();

// Global error handler (catches all errors including sub-apps)
app.onError(onAppError);

// Global middleware
app.use('*', cors());
app.use('*', loggingMiddleware);

// Register all routes
registerRoutes(app);

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
