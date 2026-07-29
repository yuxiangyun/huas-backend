/**
 * [INPUT]: 依赖调用方传入的异步任务、重试次数、退避、抖动、绝对截止时间和 shouldRetry/onRetry 回调
 * [OUTPUT]: 对外提供 RetryOptions 与 retryAsync()，在次数或时间预算耗尽时停止启动新尝试
 * [POS]: campus-integrations/http 的通用有界重试工具，被校园上游访问层用于瞬时故障恢复
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  jitterMs?: number;
  deadlineAt?: number;
  createDeadlineError?: () => unknown;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryAsync<T>(
  task: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts));
  const baseDelayMs = Math.max(0, Math.floor(options.baseDelayMs));
  const maxDelayMs = Math.max(baseDelayMs, Math.floor(options.maxDelayMs ?? baseDelayMs));
  const jitterMs = Math.max(0, Math.floor(options.jitterMs ?? 0));

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
      throw options.createDeadlineError?.() ?? lastError ?? new Error('RETRY_DEADLINE_EXCEEDED');
    }

    try {
      return await task();
    } catch (error) {
      lastError = error;
      const canRetry = attempt < attempts && (options.shouldRetry ? options.shouldRetry(error, attempt) : true);
      if (!canRetry) break;

      const backoff = Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
      const jitter = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
      const delayMs = backoff + jitter;
      if (options.deadlineAt !== undefined && Date.now() + delayMs >= options.deadlineAt) {
        throw options.createDeadlineError?.() ?? error;
      }
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
