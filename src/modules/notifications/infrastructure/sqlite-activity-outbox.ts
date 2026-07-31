/**
 * [INPUT]: 依赖构造注入的 Drizzle db、Notifications schema 与 Activity Outbox 领域端口
 * [OUTPUT]: 对外提供 SQLiteActivityOutboxWriter、SQLiteActivityOutboxStore 及兼容现有 UGC 事务的类型
 * [POS]: modules/notifications/infrastructure 的事务 Outbox adapter，使互动事实与事件同提交并以短事务幂等投影
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import { schema, type getDb } from '../../../db';
import { buildActivityEventId, type ActivityEvent } from '../domain/activity';
import type {
  ActivityOutboxStore,
  ActivityOutboxWriter,
  PendingActivityEvent,
} from '../domain/ports';

export type NotificationsDatabase = ReturnType<typeof getDb>;
export type NotificationsTransaction = Parameters<
  Parameters<NotificationsDatabase['transaction']>[0]
>[0];

function uniqueValidEvents(events: readonly ActivityEvent[]): ActivityEvent[] {
  const unique = new Map<string, ActivityEvent>();
  for (const event of events) {
    if (event.recipientUserId === event.actorUserId) continue;
    if (buildActivityEventId(event) !== event.eventId) {
      throw new Error(`Activity eventId is not stable: ${event.eventId}`);
    }
    unique.set(event.eventId, event);
  }
  return [...unique.values()];
}

function toPendingEvent(row: typeof schema.activityOutbox.$inferSelect): PendingActivityEvent {
  return {
    outboxId: row.id,
    eventId: row.eventId,
    recipientUserId: row.recipientUserId,
    actorUserId: row.actorUserId,
    type: row.type as PendingActivityEvent['type'],
    resourceType: row.resourceType as PendingActivityEvent['resourceType'],
    resourceId: row.resourceId,
    subresourceId: row.subresourceId,
    createdAt: row.createdAt,
    attemptCount: row.attemptCount,
  };
}

export class SQLiteActivityOutboxWriter
implements ActivityOutboxWriter<NotificationsTransaction> {
  enqueue(
    transaction: NotificationsTransaction,
    events: readonly ActivityEvent[],
  ): number {
    const normalized = uniqueValidEvents(events);
    if (normalized.length === 0) return 0;

    const inserted = transaction.insert(schema.activityOutbox).values(normalized.map((event) => ({
      eventId: event.eventId,
      recipientUserId: event.recipientUserId,
      actorUserId: event.actorUserId,
      type: event.type,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      subresourceId: event.subresourceId,
      createdAt: event.createdAt,
    }))).onConflictDoNothing().returning({ id: schema.activityOutbox.id }).all();
    return inserted.length;
  }

  removeLike(transaction: NotificationsTransaction, eventId: string): void {
    transaction.delete(schema.activityOutbox)
      .where(eq(schema.activityOutbox.eventId, eventId))
      .run();
    transaction.delete(schema.notifications)
      .where(eq(schema.notifications.eventId, eventId))
      .run();
  }
}

export class SQLiteActivityOutboxStore implements ActivityOutboxStore {
  constructor(private readonly db: NotificationsDatabase) {}

  async listPending(now: Date, limit: number): Promise<PendingActivityEvent[]> {
    const rows = await this.db.select()
      .from(schema.activityOutbox)
      .where(and(
        isNull(schema.activityOutbox.processedAt),
        or(
          isNull(schema.activityOutbox.nextAttemptAt),
          lte(schema.activityOutbox.nextAttemptAt, now),
        ),
      ))
      .orderBy(asc(schema.activityOutbox.id))
      .limit(limit);
    return rows.map(toPendingEvent);
  }

  async project(event: PendingActivityEvent): Promise<boolean> {
    return this.db.transaction((transaction) => {
      const rows = transaction.select()
        .from(schema.activityOutbox)
        .where(and(
          eq(schema.activityOutbox.id, event.outboxId),
          eq(schema.activityOutbox.eventId, event.eventId),
        ))
        .limit(1)
        .all();
      const current = rows[0];
      if (!current) return false;

      transaction.insert(schema.notifications).values({
        eventId: current.eventId,
        recipientUserId: current.recipientUserId,
        actorUserId: current.actorUserId,
        type: current.type,
        resourceType: current.resourceType,
        resourceId: current.resourceId,
        subresourceId: current.subresourceId,
        createdAt: current.createdAt,
      }).onConflictDoNothing().run();
      transaction.delete(schema.activityOutbox)
        .where(eq(schema.activityOutbox.id, current.id))
        .run();
      return true;
    });
  }

  async recordFailure(
    event: PendingActivityEvent,
    error: string,
    nextAttemptAt: Date,
  ): Promise<void> {
    await this.db.update(schema.activityOutbox).set({
      attemptCount: event.attemptCount + 1,
      nextAttemptAt,
      lastError: error.slice(0, 500),
    }).where(and(
      eq(schema.activityOutbox.id, event.outboxId),
      eq(schema.activityOutbox.eventId, event.eventId),
    ));
  }
}
