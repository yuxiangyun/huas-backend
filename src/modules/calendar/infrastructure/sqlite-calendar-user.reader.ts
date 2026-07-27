/**
 * [INPUT]: 依赖 Drizzle eq、SQLite getDb/schema 与 CalendarUserReader port
 * [OUTPUT]: 对外提供 SqliteCalendarUserReader，按 studentId 读取订阅所需最小用户投影
 * [POS]: calendar/infrastructure 的用户查询适配器，不泄漏数据表结构给 application
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import type { CalendarUserReader } from '../application/calendar.ports';
import type { CalendarUser } from '../domain/calendar';

export class SqliteCalendarUserReader implements CalendarUserReader {
  async findByStudentId(studentId: string): Promise<CalendarUser | null> {
    const rows = await getDb()
      .select({
        id: schema.users.id,
        studentId: schema.users.studentId,
        name: schema.users.name,
      })
      .from(schema.users)
      .where(eq(schema.users.studentId, studentId))
      .limit(1);

    const user = rows[0];
    if (!user) return null;
    return {
      id: user.id,
      studentId: user.studentId,
      name: user.name?.trim() || undefined,
    };
  }
}
