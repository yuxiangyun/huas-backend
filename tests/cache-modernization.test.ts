/**
 * [INPUT]: 依赖 Bun Test、隔离 SQLite、canonical CacheService、Academic 课表用例与 PerKeySingleflight
 * [OUTPUT]: 验证 FreshnessPolicy、v1 envelope/legacy 兼容、未知版本 miss 与同键同刷新意图回源合并
 * [POS]: tests 的 Cache 专属定向套件，覆盖 Phase 4 缓存语义而不启动 HTTP 或真实校园网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { CacheService } from '../src/modules/cache/cache-service';
import { PerKeySingleflight } from '../src/modules/cache/application/singleflight';
import { freshnessPolicy, NEVER_EXPIRES } from '../src/modules/cache/domain/freshness-policy';
import { ScheduleApplicationService } from '../src/modules/academic/application/schedule-service';
import { configureRefreshFallbackObservers, fallbackOnRefreshFailure } from '../src/services/infra/refresh-fallback';

let getDb: typeof import('../src/db').getDb;
let schema: typeof import('../src/db').schema;

beforeAll(async () => {
  const database = await import('../src/db');
  getDb = database.getDb;
  schema = database.schema;
  database.initDatabase();
});

beforeEach(async () => {
  await getDb().delete(schema.cache);
});

describe('FreshnessPolicy 与 cache envelope', () => {
  it('ttlMs=0 永不自动过期且新写入使用 v1 envelope', async () => {
    await CacheService.setWithPolicy('cache:permanent', { ok: true }, NEVER_EXPIRES, 'test');

    const rows = await getDb().select().from(schema.cache).where(eq(schema.cache.key, 'cache:permanent'));
    expect(rows).toHaveLength(1);
    expect(rows[0].expiresAt).toBeNull();
    expect(JSON.parse(rows[0].data)).toEqual({ schemaVersion: 1, payload: { ok: true } });
    expect((await CacheService.get<{ ok: boolean }>('cache:permanent'))?.data).toEqual({ ok: true });
  });

  it('正 TTL 仍生成过期时间', async () => {
    const before = Date.now();
    await CacheService.setWithPolicy('cache:ttl', { ok: true }, freshnessPolicy(2_000));
    const rows = await getDb().select().from(schema.cache).where(eq(schema.cache.key, 'cache:ttl'));

    expect(rows[0].expiresAt).not.toBeNull();
    expect(rows[0].expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 2_000);
  });

  it('旧无版本 payload 可读', async () => {
    const now = new Date();
    await getDb().insert(schema.cache).values({
      key: 'cache:legacy',
      data: JSON.stringify({ legacy: true }),
      createdAt: now,
      updatedAt: now,
      expiresAt: null,
    });

    expect((await CacheService.get<{ legacy: boolean }>('cache:legacy'))?.data).toEqual({ legacy: true });
  });

  it('未知 schemaVersion 安全 miss 且不删除可能属于新版本的数据', async () => {
    const now = new Date();
    await getDb().insert(schema.cache).values({
      key: 'cache:future',
      data: JSON.stringify({ schemaVersion: 99, payload: { future: true } }),
      createdAt: now,
      updatedAt: now,
      expiresAt: null,
    });

    expect(await CacheService.get('cache:future')).toBeNull();
    const rows = await getDb().select().from(schema.cache).where(eq(schema.cache.key, 'cache:future'));
    expect(rows).toHaveLength(1);
  });

  it('可注入观察器收到真实 hit、miss 与 singleflight merge，默认实现不依赖 Runtime', async () => {
    const accesses: string[] = [];
    let merges = 0;
    const restore = CacheService.configureObservers({
      recordAccess: (outcome) => accesses.push(outcome),
      recordSingleflightMerge: () => { merges += 1; },
    });

    try {
      expect(await CacheService.get('cache:observer')).toBeNull();
      await CacheService.set('cache:observer', { ok: true }, 0);
      expect(await CacheService.get('cache:observer')).not.toBeNull();

      let release!: () => void;
      const operation = () => new Promise<string>((resolve) => { release = () => resolve('ok'); });
      const first = CacheService.runSingleflight('cache:observer', false, operation);
      const second = CacheService.runSingleflight('cache:observer', false, operation);
      await Promise.resolve();
      release();
      await Promise.all([first, second]);

      expect(accesses).toEqual(['miss', 'hit']);
      expect(merges).toBe(1);
    } finally {
      restore();
    }
  });

  it('cache 与 singleflight observer 抛错不改变业务结果', async () => {
    const restore = CacheService.configureObservers({
      recordAccess: () => { throw new Error('METRICS_FAILED'); },
      recordSingleflightMerge: () => { throw new Error('METRICS_FAILED'); },
    });

    try {
      expect(await CacheService.get('cache:observer-failure')).toBeNull();

      let release!: () => void;
      const operation = () => new Promise<string>((resolve) => { release = () => resolve('ok'); });
      const first = CacheService.runSingleflight('cache:observer-failure', false, operation);
      const second = CacheService.runSingleflight('cache:observer-failure', false, operation);
      await Promise.resolve();
      release();
      expect(await Promise.all([first, second])).toEqual(['ok', 'ok']);
    } finally {
      restore();
    }
  });
});

function createScheduleHarness() {
  const values = new Map<string, unknown>();
  const flights = new PerKeySingleflight();
  let upstreamCalls = 0;
  let shouldFail = false;
  const releases: Array<() => void> = [];

  const service = new ScheduleApplicationService({
    upstream: async () => {
      upstreamCalls += 1;
      if (shouldFail) throw new Error('UPSTREAM_FAILED');
      await new Promise<void>((resolve) => { releases.push(resolve); });
      return { week: `week-${upstreamCalls}`, courses: [], message: '' };
    },
    cache: {
      get: async <T>(key: string) => values.has(key)
        ? { data: values.get(key) as T, meta: { cached: true } }
        : null,
      set: async (key: string, data: unknown) => { values.set(key, data); },
      enforcePrefixLimit: async () => {},
      runSingleflight: (key, forceRefresh, operation) => flights.run(key, forceRefresh ? 'refresh' : 'normal', operation),
    },
    refreshFallback: async () => null,
  });

  return {
    service,
    values,
    get upstreamCalls() { return upstreamCalls; },
    setFailure(value: boolean) { shouldFail = value; },
    releaseAll() { for (const release of releases.splice(0)) release(); },
  };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt += 1) await Promise.resolve();
  expect(predicate()).toBe(true);
}

describe('业务回源 singleflight', () => {
  it('普通缓存命中不回源，refresh=true 仍正常回源', async () => {
    const harness = createScheduleHarness();
    const cacheKey = 'schedule:2023001001:2025-03-03';
    harness.values.set(cacheKey, { week: 'cached', courses: [], message: '' });

    const hit = await harness.service.getSchedule(1, '2023001001', '2025-03-05', false);
    expect(hit.data.week).toBe('cached');
    expect(harness.upstreamCalls).toBe(0);

    const refresh = harness.service.getSchedule(1, '2023001001', '2025-03-05', true);
    await waitFor(() => harness.upstreamCalls === 1);
    harness.releaseAll();
    expect((await refresh).data.week).toBe('week-1');
  });

  it('同 key 并发 miss 只触发一次上游', async () => {
    const harness = createScheduleHarness();
    const first = harness.service.getSchedule(1, '2023001002', '2025-03-05', false);
    const second = harness.service.getSchedule(1, '2023001002', '2025-03-06', false);

    await waitFor(() => harness.upstreamCalls === 1);
    harness.releaseAll();
    const results = await Promise.all([first, second]);
    expect(harness.upstreamCalls).toBe(1);
    expect(results[0].data).toEqual(results[1].data);
  });

  it('普通请求与强制刷新不会错误合并', async () => {
    const harness = createScheduleHarness();
    const normal = harness.service.getSchedule(1, '2023001003', '2025-03-05', false);
    const refresh = harness.service.getSchedule(1, '2023001003', '2025-03-05', true);

    await waitFor(() => harness.upstreamCalls === 2);
    harness.releaseAll();
    await Promise.all([normal, refresh]);
    expect(harness.upstreamCalls).toBe(2);
  });

  it('失败后释放同键状态，后续请求可以重试', async () => {
    const harness = createScheduleHarness();
    harness.setFailure(true);
    await expect(harness.service.getSchedule(1, '2023001004', '2025-03-05', false)).rejects.toThrow('UPSTREAM_FAILED');
    expect(harness.upstreamCalls).toBe(1);

    harness.setFailure(false);
    const retry = harness.service.getSchedule(1, '2023001004', '2025-03-05', false);
    await waitFor(() => harness.upstreamCalls === 2);
    harness.releaseAll();
    await retry;
    expect(harness.upstreamCalls).toBe(2);
  });
});

describe('stale fallback 观察器', () => {
  it('只在真实采用 stale 缓存时记录一次 fallback', async () => {
    await CacheService.set('cache:fallback', { old: true }, 0, 'jw');
    let fallbacks = 0;
    const restore = configureRefreshFallbackObservers({
      recordFallback: () => { fallbacks += 1; },
    });

    try {
      const result = await fallbackOnRefreshFailure<{ old: boolean }>({
        forceRefresh: true,
        cacheKey: 'cache:fallback',
        error: new Error('REQUEST_TIMEOUT'),
        source: 'jw',
        studentId: '2023001005',
      });
      expect(result?.data).toEqual({ old: true });
      expect(fallbacks).toBe(1);

      const credentialFailure = await fallbackOnRefreshFailure({
        forceRefresh: true,
        cacheKey: 'cache:fallback',
        error: new Error('SESSION_EXPIRED'),
        source: 'jw',
        studentId: '2023001005',
      });
      expect(credentialFailure).toBeNull();
      expect(fallbacks).toBe(1);
    } finally {
      restore();
    }
  });

  it('fallback observer 抛错不破坏已选定的 stale 响应', async () => {
    await CacheService.set('cache:fallback-observer-failure', { old: true }, 0, 'jw');
    const restore = configureRefreshFallbackObservers({
      recordFallback: () => { throw new Error('METRICS_FAILED'); },
    });

    try {
      const result = await fallbackOnRefreshFailure<{ old: boolean }>({
        forceRefresh: true,
        cacheKey: 'cache:fallback-observer-failure',
        error: new Error('REQUEST_TIMEOUT'),
        source: 'jw',
        studentId: '2023001006',
      });
      expect(result?.data).toEqual({ old: true });
      expect(result?._meta.refresh_failed).toBe(true);
    } finally {
      restore();
    }
  });
});
