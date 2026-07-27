/**
 * [INPUT]: 接收进程关闭前需尽力执行的异步 flush hooks，并依赖 runtimeMetrics 记录失败
 * [OUTPUT]: 对外提供 registerShutdownFlushHook 与 flushShutdownHooks
 * [POS]: runtime 的正常关闭协调器，为 analytics 等缓冲能力提供有界、互不阻塞的收尾接点
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { runtimeMetrics } from './runtime-metrics';

export type ShutdownFlushHook = () => void | Promise<void>;

const hooks = new Map<string, ShutdownFlushHook>();

export function registerShutdownFlushHook(name: string, hook: ShutdownFlushHook) {
  hooks.set(name, hook);
  return () => hooks.delete(name);
}

async function withTimeout(task: Promise<void>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`shutdown flush timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function flushShutdownHooks(timeoutMs = 5_000) {
  const results = await Promise.all([...hooks.entries()].map(async ([name, hook]) => {
    try {
      await withTimeout(Promise.resolve().then(hook), timeoutMs);
      return { name, ok: true as const };
    } catch (error) {
      if (name === 'analytics') runtimeMetrics.recordAnalyticsFlushFailure();
      return {
        name,
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));
  return results;
}
