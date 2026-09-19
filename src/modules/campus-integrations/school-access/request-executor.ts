/**
 * [INPUT]: 依赖 RuntimeConfig、有限 retry、singleflight 与统一学校错误语义
 * [OUTPUT]: 对外提供内部请求上下文、唯一重试执行器与共享任务独立等待，最多恢复重放一次
 * [POS]: SchoolAccess 的调度边界；协议执行单次交互，共享任务返回快照而非调用方客户端
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { runtimeConfig, type RuntimeConfig } from '../../../runtime-config';
import { PerKeySingleflight } from '../../cache/application/singleflight';
import { retryAsync } from '../http/retry';
import { canRetrySchoolFailure, normalizeSchoolFailure, SchoolAccessError, schoolTimeout, schoolUnavailable } from './errors';

export interface SchoolRequestContext { readonly deadlineAt: number; readonly config: RuntimeConfig }
export function requestContext(deadlineAt = Date.now() + runtimeConfig.school.totalBudgetMs): SchoolRequestContext {
  if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now()) throw schoolTimeout();
  return Object.freeze({ deadlineAt, config: runtimeConfig });
}

function waitWithin<T>(work: Promise<T>, deadlineAt: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const remaining = deadlineAt - Date.now();
    const timer = setTimeout(() => reject(schoolTimeout()), Math.max(0, remaining));
    work.then(value => { clearTimeout(timer); remaining > 0 && Date.now() < deadlineAt ? resolve(value) : reject(schoolTimeout()); }, error => { clearTimeout(timer); reject(Date.now() >= deadlineAt ? schoolTimeout() : error); });
  });
}

export class SharedSchoolFlights {
  private readonly flights = new PerKeySingleflight();
  run<T>(key: string, waiter: SchoolRequestContext, work: (context: SchoolRequestContext) => Promise<T>): Promise<T> {
    if (Date.now() >= waiter.deadlineAt) return Promise.reject(schoolTimeout());
    const shared = this.flights.run(key, 'normal', () => work(requestContext(Date.now() + waiter.config.school.recoveryBudgetMs)));
    return waitWithin(shared, waiter.deadlineAt);
  }
}

export class SchoolRequestExecutor {
  async step<T>(context: SchoolRequestContext, work: () => Promise<T>, replayable = true, attempts = context.config.retry.businessMaxAttempts): Promise<T> {
    try {
      return await retryAsync(work, {
        attempts: replayable ? attempts : 1,
        baseDelayMs: context.config.retry.businessBaseDelayMs,
        maxDelayMs: context.config.retry.businessMaxDelayMs,
        jitterMs: context.config.retry.businessJitterMs,
        deadlineAt: context.deadlineAt,
        createDeadlineError: schoolTimeout,
        shouldRetry: canRetrySchoolFailure,
      });
    } catch (error) { throw normalizeSchoolFailure(error); }
  }

  async operation<S, T>(context: SchoolRequestContext, operation: {
    resolve(): Promise<S>;
    invalidate(session: S): Promise<unknown> | unknown;
    run(session: S): Promise<T>;
    replayable: boolean;
  }): Promise<T> {
    let session = await operation.resolve();
    for (let replay = 0; replay < 2; replay += 1) {
      try { return await this.step(context, () => operation.run(session), operation.replayable); }
      catch (error) {
        if (!(error instanceof SchoolAccessError) || error.kind !== 'session-rejected') throw error;
        await operation.invalidate(session);
        if (replay > 0 || !operation.replayable) throw schoolUnavailable();
        session = await operation.resolve();
      }
    }
    throw schoolUnavailable();
  }
}
export const schoolRequestExecutor = new SchoolRequestExecutor();
