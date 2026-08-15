/**
 * [INPUT]: 依赖 Notifications 事件与读模型 DTO，不依赖 Drizzle、Hono 或 Community 具体实现
 * [OUTPUT]: 对外提供事务内 Outbox writer（点赞/资源/子资源三级撤回）、提交后投影触发器、投影 store 与普通/增量/摘要通知查询仓储
 * [POS]: modules/notifications/domain 的依赖倒置端口，读侧永久通知只允许查询、摘要和逐条已读，撤回只经写侧 UGC 事务发生
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ActivityEvent, ActivityResourceType } from './activity';
import type { NotificationFact, NotificationSummary } from './notification';

export interface ActivityOutboxWriter<TTransaction> {
  enqueue(transaction: TTransaction, events: readonly ActivityEvent[]): number;
  removeLike(transaction: TTransaction, eventId: string): void;
  /** 删帖时同事务撤回该帖全部互动事件（含已投影通知），阻断“删除后通知永久残留”。 */
  removeResource(transaction: TTransaction, resourceType: ActivityResourceType, resourceId: number): void;
  /** 删评论时同事务撤回该评论产生的 comment/reply 事件与通知，不影响同帖其他事件。 */
  removeSubresource(
    transaction: TTransaction,
    resourceType: ActivityResourceType,
    resourceId: number,
    subresourceId: number,
  ): void;
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
