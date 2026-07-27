/**
 * [INPUT]: 依赖 Operations AnalyticsBatch 与可控内存 writer
 * [OUTPUT]: 验证高频聚合、活跃用户去重、单批 flush、失败回并重试与 shutdown 冲刷
 * [POS]: tests 的 Analytics 批处理回归套件，隔离验证请求采集与持久化边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  AnalyticsBatch,
  type AnalyticsFlushBatch,
} from '../src/modules/operations/infrastructure/analytics-batch';

function copyBatch(batch: AnalyticsFlushBatch): AnalyticsFlushBatch {
  return {
    metrics: batch.metrics.map((fact) => ({ ...fact })),
    activeUsers: batch.activeUsers.map((fact) => ({ ...fact })),
  };
}

describe('analytics batch', () => {
  it('aggregates high-frequency metrics and active users into one writer call', async () => {
    const writes: AnalyticsFlushBatch[] = [];
    const batch = new AnalyticsBatch(
      { write: (facts) => writes.push(copyBatch(facts)) },
      { flushIntervalMs: 60_000 },
    );

    for (let index = 0; index < 100; index += 1) {
      batch.increment('2026-07-27', 'miniprogram', 'request.total');
      batch.recordActiveUser('2026-07-27', 'miniprogram', 42);
    }

    expect(writes).toHaveLength(0);
    const result = await batch.flush();
    expect(result).toEqual({ success: true, metrics: 1, activeUsers: 1 });
    expect(writes).toHaveLength(1);
    expect(writes[0].metrics).toEqual([{
      day: '2026-07-27',
      platform: 'miniprogram',
      metric: 'request.total',
      value: 100,
    }]);
    expect(writes[0].activeUsers).toEqual([{
      day: '2026-07-27',
      platform: 'miniprogram',
      userId: 42,
    }]);
    await batch.shutdown();
  });

  it('restores a failed snapshot and merges facts recorded before retry', async () => {
    const writes: AnalyticsFlushBatch[] = [];
    const errors: unknown[] = [];
    let shouldFail = true;
    const batch = new AnalyticsBatch(
      {
        write(facts) {
          writes.push(copyBatch(facts));
          if (shouldFail) throw new Error('database busy');
        },
      },
      { flushIntervalMs: 60_000, onFlushError: (error) => errors.push(error) },
    );

    batch.increment('2026-07-27', 'web', 'login.success');
    batch.recordActiveUser('2026-07-27', 'web', 7);
    expect(await batch.flush()).toEqual({ success: false, metrics: 1, activeUsers: 1 });
    expect(errors).toHaveLength(1);

    batch.increment('2026-07-27', 'web', 'login.success');
    batch.recordActiveUser('2026-07-27', 'web', 7);
    shouldFail = false;
    expect(await batch.flush()).toEqual({ success: true, metrics: 1, activeUsers: 1 });
    expect(writes[1].metrics[0].value).toBe(2);
    expect(writes[1].activeUsers).toHaveLength(1);
    await batch.shutdown();
  });

  it('contains a failing flush observer without losing the retained batch', async () => {
    let shouldFail = true;
    let persistedValue = 0;
    const batch = new AnalyticsBatch(
      {
        write(facts) {
          if (shouldFail) throw new Error('database busy');
          persistedValue = facts.metrics[0]?.value ?? 0;
        },
      },
      {
        flushIntervalMs: 60_000,
        onFlushError() {
          throw new Error('metrics unavailable');
        },
      },
    );
    batch.increment('2026-07-27', 'web', 'request.total');

    expect(await batch.flush()).toEqual({ success: false, metrics: 1, activeUsers: 0 });
    shouldFail = false;
    expect(await batch.flush()).toEqual({ success: true, metrics: 1, activeUsers: 0 });
    expect(persistedValue).toBe(1);
    await batch.shutdown();
  });

  it('retries a retained batch on the next scheduled flush cycle', async () => {
    let attempts = 0;
    let persistedValue = 0;
    let markPersisted: () => void = () => {};
    const persisted = new Promise<void>((resolve) => {
      markPersisted = resolve;
    });
    const batch = new AnalyticsBatch(
      {
        write(facts) {
          attempts += 1;
          if (attempts === 1) throw new Error('temporary failure');
          persistedValue = facts.metrics[0]?.value ?? 0;
          markPersisted();
        },
      },
      { flushIntervalMs: 5 },
    );
    batch.increment('2026-07-27', 'web', 'request.total');

    const completed = await Promise.race([
      persisted.then(() => true),
      Bun.sleep(500).then(() => false),
    ]);
    expect(completed).toBe(true);
    expect(attempts).toBe(2);
    expect(persistedValue).toBe(1);
    await batch.shutdown();
  });

  it('flushes the final pending batch during explicit shutdown', async () => {
    const writes: AnalyticsFlushBatch[] = [];
    const batch = new AnalyticsBatch(
      { write: (facts) => writes.push(copyBatch(facts)) },
      { flushIntervalMs: 60_000 },
    );
    batch.increment('2026-07-27', 'unknown', 'login.failure');

    const result = await batch.shutdown();
    expect(result).toEqual({ success: true, metrics: 1, activeUsers: 0 });
    expect(writes).toHaveLength(1);
    expect(await batch.flush()).toEqual({ success: true, metrics: 0, activeUsers: 0 });
  });
});
