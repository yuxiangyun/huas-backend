import { eq } from 'drizzle-orm';
import { schema, type getDb } from '../../../db';
import type { ScheduleShareOwnerReader } from '../../academic/domain/schedule-share';
import { normalizeSchoolProfileName } from '../domain/school-profile';

/** 姓名只取 Identity 已确认的学校资料，排除社区昵称和 JWT 旧资料。 */
export class SQLiteScheduleShareOwnerReader implements ScheduleShareOwnerReader {
  constructor(private readonly db: ReturnType<typeof getDb>) {}

  async find(userId: number) {
    const owner = this.db.select({ studentId: schema.users.studentId, name: schema.users.name })
      .from(schema.users).where(eq(schema.users.id, userId)).get();
    return owner ? { studentId: owner.studentId, name: normalizeSchoolProfileName(owner.name) } : null;
  }
}
