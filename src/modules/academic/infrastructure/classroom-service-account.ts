/**
 * [INPUT]: 依赖 config.CLASSROOM_ADMIN_STUDENT_ID、Drizzle users 表与统一 AppError
 * [OUTPUT]: 对外提供 resolveClassroomServiceAccountUserId，将配置学号解析为已登录用户 ID
 * [POS]: academic/infrastructure 的服务账号持久化适配器，禁止把请求用户凭证用于管理员代查
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { eq } from 'drizzle-orm';
import { config } from '../../../config';
import { getDb, schema } from '../../../db';
import { AppError, ErrorCode } from '../../../utils/errors';

export async function resolveClassroomServiceAccountUserId(): Promise<number> {
  const adminStudentId = config.schoolService.classroomAdminStudentId;
  if (!adminStudentId) {
    throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '空教室服务账号未配置');
  }

  const rows = await getDb().select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.studentId, adminStudentId))
    .limit(1);
  const userId = rows[0]?.id;
  if (!userId) {
    throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '空教室服务账号未登录或凭证已过期');
  }
  return userId;
}
