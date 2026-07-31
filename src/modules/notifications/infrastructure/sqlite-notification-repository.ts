/**
 * [INPUT]: 依赖构造注入的 Drizzle db、Notifications schema 与 NotificationRepository 端口
 * [OUTPUT]: 对外提供 SQLiteNotificationRepository，完成 recipient 隔离的列表、未读、逐条已读和已读清理
 * [POS]: modules/notifications/infrastructure 的通知事实 adapter，只访问 notifications 自有表且不跨域 JOIN
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, desc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
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

  async deleteReadBefore(before: Date): Promise<number> {
    const rows = await this.db.delete(schema.notifications)
      .where(and(
        isNotNull(schema.notifications.readAt),
        lt(schema.notifications.readAt, before),
      ))
      .returning({ id: schema.notifications.id });
    return rows.length;
  }
}
