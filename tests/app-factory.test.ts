/**
 * [INPUT]: 依赖 createApp、Hono 假路由、Runtime metrics、统一 Logger 与注入式媒体端口
 * [OUTPUT]: 覆盖应用工厂的路由/指标挂载、quiet polling 可观测性、媒体 404 与进程入口无隐式 migration 约束
 * [POS]: tests 的 HTTP 装配定向回归，确保应用构造可测试、访问日志静默不吞指标且 index.ts 只持有进程生命周期
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { createApp } from '../src/app';
import { runtimeMetrics } from '../src/runtime/runtime-metrics';
import { Logger } from '../src/utils/logger';

describe('createApp', () => {
  test('mounts injected application routes and metrics without opening a server', async () => {
    const metrics = new Hono().get('/', (c) => c.text('metric 1'));
    const app = createApp({
      metricsRoutes: metrics,
      media: [],
      registerRoutes(target) {
        target.get('/probe', (c) => c.json({ ok: true }));
      },
    }, { development: false });

    expect(await (await app.request('http://localhost/probe')).json()).toEqual({ ok: true });
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
