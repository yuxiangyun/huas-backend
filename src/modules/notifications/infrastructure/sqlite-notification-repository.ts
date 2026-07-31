/**
 * [INPUT]: 依赖构造注入的 Drizzle db、Notifications schema 与 NotificationRepository 端口
 * [OUTPUT]: 对外提供 SQLiteNotificationRepository，完成 recipient 隔离的排序列表、ID 增量、未读与逐条已读
 * [POS]: modules/notifications/infrastructure 的永久通知事实 adapter，普通翻页按创建时间排序、轮询按单调 ID 高水位读取
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { schema } from '../../../db';
import type { NotificationFact } from '../domain/notification';
import type { NotificationRepository } from '../domain/ports';
import type { NotificationsDatabase } from './sqlite-activity-outbox';

function toNotificationFact(row: typeof schema.notifications.$inferSelect): NotificationFact {
  return {
    ...row,
    type: row.type as NotificationFact['type'],
    resourceType: row.resourceType as NotificationFact['resourceType'],
  };
}

export class SQLiteNotificationRepository implements NotificationRepository {
  constructor(private readonly db: NotificationsDatabase) {}

  async list(recipientUserId: number, page: number, pageSize: number) {
    const filter = eq(schema.notifications.recipientUserId, recipientUserId);
    const [countRows, rows] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` })
        .from(schema.notifications)
        .where(filter),
      this.db.select()
        .from(schema.notifications)
        .where(filter)
        .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    return {
      items: rows.map(toNotificationFact),
      total: Number(countRows[0]?.count || 0),
    };
  }

  async listChanges(recipientUserId: number, afterNotificationId: number, limit: number) {
    const rows = await this.db.select()
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.recipientUserId, recipientUserId),
        gt(schema.notifications.id, afterNotificationId),
      ))
      .orderBy(asc(schema.notifications.id))
      .limit(limit);
    return rows.map(toNotificationFact);
  }

  async countUnread(recipientUserId: number): Promise<number> {
    const rows = await this.db.select({ count: sql<number>`count(*)` })
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.recipientUserId, recipientUserId),
        isNull(schema.notifications.readAt),
      ));
    return Number(rows[0]?.count || 0);
  }

  async markRead(recipientUserId: number, notificationId: number, readAt: Date): Promise<boolean> {
    const rows = await this.db.update(schema.notifications)
      .set({ readAt: sql`coalesce(${schema.notifications.readAt}, ${readAt.getTime()})` })
      .where(and(
        eq(schema.notifications.id, notificationId),
        eq(schema.notifications.recipientUserId, recipientUserId),
      ))
      .returning({ id: schema.notifications.id });
    return rows.length > 0;
  }
}
