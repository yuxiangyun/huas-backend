/**
 * [INPUT]: 依赖 PeriodicTaskRegistry 与可控测试时钟
 * [OUTPUT]: 覆盖周期任务注册、幂等启停、失败隔离和同任务禁止重叠
 * [POS]: tests 的 runtime 周期协调器定向回归，阻止维护任务制造并发副作用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, test } from 'bun:test';
import {
  PeriodicTaskRegistry,
  type PeriodicTaskClock,
} from '../src/runtime/periodic-tasks';

function controlledClock() {
  const callbacks: Array<() => void> = [];
  const cleared = new Set<object>();
  const clock: PeriodicTaskClock = {
    setInterval(callback) {
      const handle = { unref: () => undefined };
      callbacks.push(() => {
        if (!cleared.has(handle)) callback();
      });
      return handle;
    },
    clearInterval(handle) {
      cleared.add(handle as object);
    },
  };
  return { clock, callbacks };
}

describe('PeriodicTaskRegistry', () => {
  test('starts and stops idempotently while clearing registered timers', async () => {
    const { clock, callbacks } = controlledClock();
    let runs = 0;
    const registry = new PeriodicTaskRegistry(() => undefined, clock);
    registry.register({ name: 'cleanup', intervalMs: 1000, run: () => { runs += 1; } });

    registry.start();
    registry.start();
    expect(callbacks).toHaveLength(1);
    callbacks[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(runs).toBe(1);

    await registry.stop();
    await registry.stop();
    callbacks[0]?.();
    await Promise.resolve();
    expect(runs).toBe(1);
  });

  test('does not overlap the same task and permits a later execution', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let runs = 0;
    const registry = new PeriodicTaskRegistry();
    registry.register({
      name: 'outbox',
      intervalMs: 1000,
      run: async () => {
        runs += 1;
        await gate;
      },
    });

    const first = registry.runNow('outbox');
    await Promise.resolve();
    expect(await registry.runNow('outbox')).toBe(false);
    expect(runs).toBe(1);
    release();
    expect(await first).toBe(true);
    expect(await registry.runNow('outbox')).toBe(true);
    expect(runs).toBe(2);
  });

  test('isolates task and observer failures', async () => {
    const failures: string[] = [];
    const registry = new PeriodicTaskRegistry(({ name }) => {
      failures.push(name);
      throw new Error('observer failure');
    });
    registry.register({ name: 'broken', intervalMs: 1000, run: () => { throw new Error('boom'); } });
    registry.register({ name: 'healthy', intervalMs: 1000, run: () => undefined });

    expect(await registry.runNow('broken')).toBe(true);
    expect(await registry.runNow('healthy')).toBe(true);
    expect(failures).toEqual(['broken']);
  });
});
