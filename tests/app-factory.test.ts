/**
 * [INPUT]: 依赖 createApp、Hono 假路由、Runtime metrics、统一 Logger、临时 Web 产物与注入式媒体端口
 * [OUTPUT]: 覆盖 Web 分层缓存、私有 API no-store、路由/指标挂载、quiet polling、媒体 404 与进程入口无隐式 migration 约束
 * [POS]: tests 的 HTTP 装配定向回归，确保发布入口重验证、哈希资源不可变且 index.ts 只持有进程生命周期
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { createApp } from '../src/app';
import { runtimeMetrics } from '../src/runtime/runtime-metrics';
import { Logger } from '../src/utils/logger';

describe('createApp', () => {
  test('revalidates the web entry with a weak ETag instead of disabling browser storage', async () => {
    const appRoot = mkdtempSync(join(tmpdir(), 'huas-app-factory-'));
    const indexPath = join(appRoot, 'web', 'dist', 'index.html');
    const assetPath = join(appRoot, 'web', 'dist', 'assets', 'index-abc12345.js');
    const fixedAssetPath = join(appRoot, 'web', 'dist', 'assets', 'runtime.js');
    const manifestPath = join(appRoot, 'web', 'dist', 'manifest.webmanifest');
    mkdirSync(join(appRoot, 'web', 'dist', 'assets'), { recursive: true });
    writeFileSync(indexPath, '<!doctype html><html><body>test</body></html>');
    writeFileSync(assetPath, 'console.log("versioned")');
    writeFileSync(fixedAssetPath, 'console.log("fixed")');
    writeFileSync(manifestPath, '{"name":"huas"}');

    try {
      const app = createApp({
        metricsRoutes: new Hono(),
        media: [],
        registerRoutes() {},
      }, { appRoot, development: false });

      const firstResponse = await app.request('http://localhost/m');
      const etag = firstResponse.headers.get('etag');
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
      expect(etag).toMatch(/^W\/\"[0-9a-f]+-[0-9a-f]+\"$/);
      expect(await firstResponse.text()).toContain('<!doctype html>');

      const revalidatedResponse = await app.request('http://localhost/m', {
        headers: { 'If-None-Match': etag! },
      });
      expect(revalidatedResponse.status).toBe(304);
      expect(revalidatedResponse.headers.get('etag')).toBe(etag);
      expect(await revalidatedResponse.text()).toBe('');

      const deepLinkResponse = await app.request('http://localhost/m/messages');
      expect(deepLinkResponse.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
      expect(deepLinkResponse.headers.get('etag')).toBe(etag);

      const assetResponse = await app.request('http://localhost/m/assets/index-abc12345.js');
      expect(assetResponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(assetResponse.headers.get('etag')).toBeNull();

      const fixedAssetResponse = await app.request('http://localhost/m/assets/runtime.js');
      expect(fixedAssetResponse.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
      expect(fixedAssetResponse.headers.get('etag')).toBeTruthy();

      const manifestResponse = await app.request('http://localhost/m/manifest.webmanifest');
      const manifestEtag = manifestResponse.headers.get('etag');
      expect(manifestResponse.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
      expect(manifestEtag).toBeTruthy();
      const revalidatedManifest = await app.request('http://localhost/m/manifest.webmanifest', {
        headers: { 'If-None-Match': manifestEtag! },
      });
      expect(revalidatedManifest.status).toBe(304);

      writeFileSync(indexPath, '<!doctype html><html><body>test-version-two</body></html>');
      const changedEntryResponse = await app.request('http://localhost/m', {
        headers: { 'If-None-Match': etag! },
      });
      expect(changedEntryResponse.status).toBe(200);
      expect(changedEntryResponse.headers.get('etag')).not.toBe(etag);
      expect(await changedEntryResponse.text()).toContain('test-version-two');
    } finally {
      rmSync(appRoot, { recursive: true, force: true });
    }
  });

  test('mounts injected application routes and metrics without opening a server', async () => {
    const metrics = new Hono().get('/', (c) => c.text('metric 1'));
    const app = createApp({
      metricsRoutes: metrics,
      media: [],
      registerRoutes(target) {
        target.get('/probe', (c) => c.json({ ok: true }));
        target.get('/api/probe', (c) => c.json({ ok: true }));
        target.get('/auth/probe', (c) => c.json({ ok: true }));
      },
    }, { development: false });

    expect(await (await app.request('http://localhost/probe')).json()).toEqual({ ok: true });
    expect((await app.request('http://localhost/probe')).headers.get('cache-control')).toBeNull();
    expect((await app.request('http://localhost/api/probe')).headers.get('cache-control')).toBe('private, no-store');
    expect((await app.request('http://localhost/auth/probe')).headers.get('cache-control')).toBe('private, no-store');
    expect(await (await app.request('http://localhost/metrics')).text()).toBe('metric 1');
  });

  test('keeps media authorization and lookup behind the injected endpoint', async () => {
    let requestedPath = '';
    const app = createApp({
      metricsRoutes: new Hono(),
      registerRoutes() {},
      media: [{
        basePath: '/media/example',
        cacheControl: 'private, no-store',
        async getFile(path) {
          requestedPath = path;
          return null;
        },
      }],
    }, { development: false });

    expect((await app.request('http://localhost/media/example/missing.webp')).status).toBe(404);
    expect(requestedPath).toBe('/media/example/missing.webp');
  });

  test('keeps private no-store on API responses produced by the global error boundary', async () => {
    const errorLog = spyOn(Logger, 'error').mockImplementation(() => undefined);
    try {
      const app = createApp({
        metricsRoutes: new Hono(),
        media: [],
        registerRoutes(target) {
          target.get('/api/fail', () => {
            throw new Error('cache-policy-probe');
          });
        },
      }, { development: false });

      const response = await app.request('http://localhost/api/fail');
      expect(response.status).toBe(500);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    } finally {
      errorLog.mockRestore();
    }
  });

  test('keeps metrics while successful polling suppresses only its access log', async () => {
    const httpLog = spyOn(Logger, 'http').mockImplementation(() => undefined);
    const recordMetric = spyOn(runtimeMetrics, 'recordHttpRequest');
    try {
      const app = createApp({
        metricsRoutes: new Hono(),
        media: [],
        registerRoutes(target) {
          target.get('/api/notifications/unread-count', (c) => c.json({ unreadCount: 0 }));
        },
      }, { development: false });

      expect((await app.request('http://localhost/api/notifications/unread-count')).status).toBe(200);
      expect(httpLog).toHaveBeenCalledTimes(0);
      expect(recordMetric).toHaveBeenCalledTimes(1);
      expect(recordMetric.mock.calls[0]?.[0]).toBe('GET');
      expect(recordMetric.mock.calls[0]?.[1]).toBe(200);
    } finally {
      httpLog.mockRestore();
      recordMetric.mockRestore();
    }
  });
});

test('process entry validates schema and never calls a migration API', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  expect(source).toContain('assertConfiguredDatabaseSchemaCurrent()');
  expect(source.indexOf('assertConfiguredDatabaseSchemaCurrent()')).toBeLessThan(source.indexOf('server = Bun.serve'));
  expect(source).not.toContain('initDatabase');
  expect(source).not.toContain('migrateDatabase');
  expect(source).not.toContain('setInterval');
});
