/**
 * [INPUT]: 依赖 ActivityOutboxStore、Notifications 重试/批量策略与统一 Logger，不依赖具体 SQLite 或周期调度器
 * [OUTPUT]: 对外提供 ActivityOutboxProjector.runOnce()，分别隔离事件投影与失败状态写回异常
 * [POS]: modules/notifications/application 的 Outbox 消费用例，可被请求后即时尝试和 periodic task 共同调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Logger } from '../../../utils/logger';
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
        try {
          await this.store.recordFailure(
            event,
            errorMessage(error),
            new Date(now.getTime() + this.retryDelay(event)),
          );
        } catch (recordError) {
          Logger.warn(
            'ActivityOutboxProjector',
            `投影失败状态写回失败 eventId=${event.eventId}`,
            `projection=${errorMessage(error)}; record=${errorMessage(recordError)}`,
          );
        }
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
