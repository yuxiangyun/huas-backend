/**
 * [INPUT]: 依赖 Notifications 事件与读模型 DTO，不依赖 Drizzle、Hono 或 Community 具体实现
 * [OUTPUT]: 对外提供事务内 Outbox writer、提交后投影触发器、投影 store 与通知查询仓储窄边界
 * [POS]: modules/notifications/domain 的依赖倒置端口，允许 UGC 事务写事件并由后台投影独立消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ActivityEvent } from './activity';
import type { NotificationFact } from './notification';

export interface ActivityOutboxWriter<TTransaction> {
  enqueue(transaction: TTransaction, events: readonly ActivityEvent[]): number;
  removeLike(transaction: TTransaction, eventId: string): void;
}

export interface ActivityProjectionTrigger {
  attempt(): Promise<void>;
}

export interface PendingActivityEvent extends ActivityEvent {
  outboxId: number;
  attemptCount: number;
}

export interface ActivityOutboxStore {
  listPending(now: Date, limit: number): Promise<PendingActivityEvent[]>;
  project(event: PendingActivityEvent): Promise<boolean>;
  recordFailure(event: PendingActivityEvent, error: string, nextAttemptAt: Date): Promise<void>;
}

export interface NotificationRepository {
  list(
    recipientUserId: number,
    page: number,
    pageSize: number,
  ): Promise<{ items: NotificationFact[]; total: number }>;
  countUnread(recipientUserId: number): Promise<number>;
  markRead(recipientUserId: number, notificationId: number, readAt: Date): Promise<boolean>;
  deleteReadBefore(before: Date): Promise<number>;
}
