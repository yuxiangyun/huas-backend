/**
 * [INPUT]: 依赖 Runtime readiness/metrics/shutdown hooks、HTTP 日志中间件、Operations health/metrics 路由、迁移注册表与隔离 SQLite
 * [OUTPUT]: 验证 live/ready 故障矩阵、轮询 quiet 日志、既有 health 兼容响应、指标序列化与 flush 失败隔离
 * [POS]: tests 的 Runtime Engineering 与 HTTP 可观测性定向回归套件；共享测试地图由总控统一回环
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { MIGRATIONS } from '../src/db/migrations';
import healthRoutes from '../src/modules/operations/http/health.routes';
import metricsRoutes from '../src/modules/operations/http/metrics.routes';
import { createReadinessProbe } from '../src/runtime/readiness';
import { createRuntimeMetrics, runtimeMetrics } from '../src/runtime/runtime-metrics';
import { serverState } from '../src/runtime/server-state';
import { flushShutdownHooks, registerShutdownFlushHook } from '../src/runtime/shutdown-hooks';
import { configureHttpClientObservers, HttpClient } from '../src/modules/campus-integrations/http/http-client';
import { loggingMiddleware } from '../src/middleware/logging.middleware';
import { Logger } from '../src/utils/logger';

const LATEST_MIGRATION_VERSION = MIGRATIONS.at(-1)?.version ?? 0;

afterEach(() => serverState.markStarting());

describe('runtime readiness failure matrix', () => {
  function probe(overrides: Partial<Parameters<typeof createReadinessProbe>[0]> = {}) {
    return createReadinessProbe({
      processStatus: () => ({ ready: true, shuttingDown: false, shutdownSignal: null, deploySlot: 'test' }),
      probeSqlite: () => undefined,
      currentMigrationVersion: () => 1,
      expectedMigrationVersion: 1,
      ...overrides,
    }).check();
  }

  it('is ready only when process, SQLite and migration version all pass', () => {
    expect(probe().ready).toBe(true);
    expect(probe({
      processStatus: () => ({ ready: false, shuttingDown: false, shutdownSignal: null, deploySlot: 'test' }),
    }).checks.process.state).toBe('starting');
    expect(probe({
      processStatus: () => ({ ready: false, shuttingDown: true, shutdownSignal: 'SIGTERM', deploySlot: 'test' }),
    }).checks.process.state).toBe('shutting-down');
    expect(probe({ currentMigrationVersion: () => 0 }).checks.migration).toEqual({
      ok: false,
      currentVersion: 0,
      expectedVersion: 1,
    });
    const migrationFailure = probe({ currentMigrationVersion: () => { throw new Error('migration table missing'); } });
    expect(migrationFailure.checks.sqlite.ok).toBe(true);
    expect(migrationFailure.checks.migration).toEqual({
      ok: false,
      currentVersion: null,
      expectedVersion: 1,
      error: 'migration table missing',
    });
  });

  it('fails closed on SQLite errors without probing any school upstream', () => {
    let processReads = 0;
    const result = probe({
      processStatus: () => {
        processReads += 1;
        return { ready: true, shuttingDown: false, shutdownSignal: null, deploySlot: 'test' };
      },
      probeSqlite: () => { throw new Error('SQLITE_BUSY: database is locked'); },
      currentMigrationVersion: () => { throw new Error('must not run after failed SELECT 1'); },
    });
    expect(result.ready).toBe(false);
    expect(result.checks.sqlite.ok).toBe(false);
    expect(result.checks.migration.currentVersion).toBeNull();
    expect(processReads).toBe(1);
  });
});

describe('runtime HTTP probes', () => {
  function app() {
    const instance = new Hono();
    instance.route('/health', healthRoutes);
    instance.route('/metrics', metricsRoutes);
    return instance;
  }

  it('keeps live independent while ready follows process and local database state', async () => {
    serverState.markStarting();
    const startingLive = await app().request('http://localhost/health/live');
    const startingReady = await app().request('http://localhost/health/ready');
    expect(startingLive.status).toBe(200);
    expect((await startingLive.json() as any).data.status).toBe('live');
    expect(startingReady.status).toBe(503);

    serverState.markReady();
    const ready = await app().request('http://localhost/health/ready');
    expect(ready.status).toBe(200);
    expect((await ready.json() as any).data.checks.migration).toEqual({
      ok: true,
      currentVersion: LATEST_MIGRATION_VERSION,
      expectedVersion: LATEST_MIGRATION_VERSION,
    });

    serverState.beginShutdown('SIGTERM');
    expect((await app().request('http://localhost/health/live')).status).toBe(200);
    expect((await app().request('http://localhost/health/ready')).status).toBe(503);
  });

  it('preserves the existing /health success response semantics', async () => {
    serverState.markReady();
    const response = await app().request('http://localhost/health');
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(typeof body.data.timestamp).toBe('string');
    expect(typeof body.data.uptime).toBe('number');
    expect(typeof body.data.deploySlot).toBe('string');
  });

  it('exports low-cardinality Prometheus metrics at /metrics', async () => {
    runtimeMetrics.recordUpstream('timeout');
    const response = await app().request('http://localhost/metrics');
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(body).toContain('huas_upstream_requests_total{outcome="timeout"}');
    expect(body).toContain('huas_analytics_flush_failure_total');
  });
});

describe('HTTP polling quiet logs', () => {
  function app() {
    const instance = new Hono();
    instance.use('*', loggingMiddleware);
    instance.get('/api/notifications/unread-count', (c) => c.json({ success: true }));
    instance.get('/api/messaging/unread-count', (c) => c.json({ success: true }));
    instance.get('/api/messaging/conversations', (c) => c.json({ success: true }));
    instance.get('/api/messaging/conversations/:id/messages', (c) => {
      return c.req.param('id') === '404'
        ? c.json({ success: false }, 404)
        : c.json({ success: true });
    });
    instance.put('/api/messaging/conversations/:id/read', (c) => c.json({ success: true }));
    return instance;
  }

  it('suppresses only successful GET polling access logs', async () => {
    const httpLog = spyOn(Logger, 'http').mockImplementation(() => undefined);
    try {
      expect((await app().request('http://localhost/api/notifications/unread-count')).status).toBe(200);
      expect((await app().request('http://localhost/api/messaging/unread-count')).status).toBe(200);
      expect((await app().request('http://localhost/api/messaging/conversations')).status).toBe(200);
      expect((await app().request('http://localhost/api/messaging/conversations/1/messages')).status).toBe(200);
      expect(httpLog).toHaveBeenCalledTimes(0);

      expect((await app().request('http://localhost/api/messaging/conversations/404/messages')).status).toBe(404);
      expect(httpLog).toHaveBeenCalledTimes(1);

      expect((await app().request('http://localhost/api/messaging/conversations/1/read', {
        method: 'PUT',
      })).status).toBe(200);
      expect(httpLog).toHaveBeenCalledTimes(2);
    } finally {
      httpLog.mockRestore();
    }
  });
});

describe('runtime metrics and shutdown hooks', () => {
  it('tracks every required event family and request latency', () => {
    const metrics = createRuntimeMetrics();
    metrics.recordHttpRequest('get', 200, 12.5);
    metrics.recordHttpRequest('ATTACKER-CONTROLLED', 418, 1);
    metrics.recordUpstream('success');
    metrics.recordUpstream('failure');
    metrics.recordFallback();
    metrics.recordCache('hit');
    metrics.recordCache('miss');
    metrics.recordSingleflightMerge();
    metrics.recordSqliteBusy();
    expect(metrics.recordSqliteBusyError(new Error('SQLITE_BUSY: database is locked'))).toBe(true);
    expect(metrics.recordSqliteBusyError(new Error('unrelated'))).toBe(false);
    metrics.recordAnalyticsFlushFailure();
    const rendered = metrics.renderPrometheus();
    for (const name of [
      'huas_http_requests_total',
      'huas_http_request_duration_ms_count',
      'huas_http_request_duration_ms_sum',
      'huas_upstream_requests_total',
      'huas_fallback_total',
      'huas_cache_access_total',
      'huas_singleflight_merge_total',
      'huas_sqlite_busy_total',
      'huas_analytics_flush_failure_total',
    ]) expect(rendered).toContain(name);
    expect(rendered).toContain('huas_http_requests_total{method="OTHER",status="418"} 1');
  });

  it('runs all shutdown hooks and isolates a flush failure', async () => {
    let successfulFlushes = 0;
    const removeSuccess = registerShutdownFlushHook('runtime-test-success', async () => { successfulFlushes += 1; });
    const removeFailure = registerShutdownFlushHook('runtime-test-failure', async () => { throw new Error('flush failed'); });
    try {
      const results = await flushShutdownHooks(100);
      expect(results.find((item) => item.name === 'runtime-test-success')?.ok).toBe(true);
      expect(results.find((item) => item.name === 'runtime-test-failure')?.ok).toBe(false);
      expect(successfulFlushes).toBe(1);
    } finally {
      removeSuccess();
      removeFailure();
    }
  });

  it('bounds an Analytics shutdown timeout and records the extra Runtime failure', async () => {
    const readFailureCount = () => Number(
      runtimeMetrics.renderPrometheus().match(/huas_analytics_flush_failure_total (\d+)/)?.[1] ?? 0,
    );
    const before = readFailureCount();
    const remove = registerShutdownFlushHook('analytics', () => new Promise<void>(() => undefined));
    try {
      const results = await flushShutdownHooks(1);
      expect(results.find((item) => item.name === 'analytics')?.ok).toBe(false);
      expect(readFailureCount()).toBe(before + 1);
    } finally {
      remove();
    }
  });
});

describe('campus HTTP runtime observations', () => {
  it('records each actual request once as success, failure or timeout', async () => {
    const outcomes: string[] = [];
    const restoreObserver = configureHttpClientObservers({
      recordOutcome: (outcome) => outcomes.push(outcome),
    });
    const fetchSpy = spyOn(globalThis, 'fetch');
    try {
      fetchSpy.mockResolvedValueOnce(new Response('ok', { status: 200 }));
      fetchSpy.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
      fetchSpy.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      const client = new HttpClient(undefined, 50);
      expect((await client.request('https://upstream.example/success')).status).toBe(200);
      expect((await client.request('https://upstream.example/failure')).status).toBe(503);
      await expect(client.request('https://upstream.example/timeout')).rejects.toThrow('REQUEST_TIMEOUT');
      expect(outcomes).toEqual(['success', 'failure', 'timeout']);
    } finally {
      fetchSpy.mockRestore();
      restoreObserver();
    }
  });

  it('isolates observer exceptions from responses and session-expired errors', async () => {
    const restoreObserver = configureHttpClientObservers({
      recordOutcome: () => { throw new Error('observer failed'); },
    });
    const fetchSpy = spyOn(globalThis, 'fetch');
    try {
      fetchSpy.mockResolvedValueOnce(new Response('ok', { status: 200 }));
      fetchSpy.mockResolvedValueOnce(new Response('', { status: 401 }));
      const client = new HttpClient(undefined, 50);
      expect((await client.request('https://upstream.example/success')).status).toBe(200);
      await expect(client.request('https://upstream.example/session')).rejects.toThrow('SESSION_EXPIRED');
    } finally {
      fetchSpy.mockRestore();
      restoreObserver();
    }
  });
});
