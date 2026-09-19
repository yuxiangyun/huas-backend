/**
 * [INPUT]: 依赖 db/getDb/schema 与 IdentityStorePort
 * [OUTPUT]: 对外提供 SqliteIdentityStore，只查询本地登录身份及更新活跃时间
 * [POS]: identity/infrastructure 的用户持久化边界；真实学校认证的身份创建与凭证提交已由 SchoolAccess 状态仓储统一持有
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import type { IdentityStorePort } from '../application/login.ports';
import type { LoginUser } from '../domain/login';

export class SqliteIdentityStore implements IdentityStorePort {
  async findByStudentId(studentId: string): Promise<LoginUser | null> {
    const row = getDb().select({
      id: schema.users.id,
      studentId: schema.users.studentId,
      name: schema.users.name,
      className: schema.users.className,
      encryptedPassword: schema.users.encryptedPassword,
    }).from(schema.users).where(eq(schema.users.studentId, studentId)).limit(1).get();
    return row || null;
  }

  async touchLocalLogin(userId: number, at: Date): Promise<void> {
    getDb().update(schema.users).set({ lastLoginAt: at, lastActiveAt: at }).where(eq(schema.users.id, userId)).run();
  }

}
