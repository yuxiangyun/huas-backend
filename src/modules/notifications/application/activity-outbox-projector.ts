/**
 * [INPUT]: 依赖 ActivityOutboxStore 与 Notifications 重试/批量策略，不依赖具体 SQLite 或周期调度器
 * [OUTPUT]: 对外提供 ActivityOutboxProjector.runOnce()，逐事件隔离投影失败并写入指数退避状态
 * [POS]: modules/notifications/application 的 Outbox 消费用例，可被请求后即时尝试和 periodic task 共同调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { NotificationsPolicy } from '../domain/notification';
import type { ActivityOutboxStore, PendingActivityEvent } from '../domain/ports';

export interface ActivityProjectionResult {
  selected: number;
  projected: number;
  failed: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ActivityOutboxProjector {
  constructor(
    private readonly store: ActivityOutboxStore,
    private readonly policy: NotificationsPolicy,
  ) {}

  async runOnce(now: Date = new Date()): Promise<ActivityProjectionResult> {
    const pending = await this.store.listPending(now, this.policy.projectionBatchSize);
    let projected = 0;
    let failed = 0;

    for (const event of pending) {
      try {
        if (await this.store.project(event)) projected += 1;
      } catch (error) {
        failed += 1;
        await this.store.recordFailure(
          event,
          errorMessage(error),
          new Date(now.getTime() + this.retryDelay(event)),
        );
      }
    }

    return { selected: pending.length, projected, failed };
  }

  private retryDelay(event: PendingActivityEvent): number {
    const exponent = Math.min(event.attemptCount, 30);
    return Math.min(
      this.policy.retryMaxDelayMs,
      this.policy.retryBaseDelayMs * (2 ** exponent),
    );
  }
}
