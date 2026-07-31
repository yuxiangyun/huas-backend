/**
 * [INPUT]: 依赖 Notifications 事件与读模型 DTO，不依赖 Drizzle、Hono 或 Community 具体实现
 * [OUTPUT]: 对外提供事务内 Outbox writer、提交后投影触发器、投影 store 与普通/增量/摘要通知查询仓储
 * [POS]: modules/notifications/domain 的依赖倒置端口，永久通知只允许查询、摘要和逐条已读，不向应用暴露删除能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ActivityEvent } from './activity';
import type { NotificationFact, NotificationSummary } from './notification';

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
  listChanges(
    recipientUserId: number,
    afterNotificationId: number,
    limit: number,
  ): Promise<NotificationFact[]>;
  summarize(recipientUserId: number): Promise<NotificationSummary>;
  countUnread(recipientUserId: number): Promise<number>;
  markRead(recipientUserId: number, notificationId: number, readAt: Date): Promise<boolean>;
}
