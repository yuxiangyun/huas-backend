/**
 * [INPUT]: 依赖 db/getDb/schema、commitRealSchoolLoginContext 与 IdentityStorePort
 * [OUTPUT]: 对外提供 SqliteIdentityStore，查询/触碰登录用户并把用户 upsert 与真实学校登录上下文提交纳入同一事务
 * [POS]: identity/infrastructure 的用户持久化边界；基础凭证、epoch、缺失 Portal 删除与派生会话清理由共享学校登录事务原语闭环
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { commitRealSchoolLoginContext } from '../../campus-integrations/credential-recovery/school-login-context';
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

  async commitRealSchoolLogin(input: Parameters<IdentityStorePort['commitRealSchoolLogin']>[0]): Promise<LoginUser> {
    return getDb().transaction((tx) => {
      const user = tx.insert(schema.users).values({
        studentId: input.studentId,
        name: null,
        className: null,
        encryptedPassword: input.encryptedPassword,
        createdAt: input.at,
        lastLoginAt: input.at,
        lastActiveAt: input.at,
      }).onConflictDoUpdate({
        target: schema.users.studentId,
        set: {
          encryptedPassword: input.encryptedPassword,
          lastLoginAt: input.at,
          lastActiveAt: input.at,
        },
      }).returning({
        id: schema.users.id,
        studentId: schema.users.studentId,
        name: schema.users.name,
        className: schema.users.className,
        encryptedPassword: schema.users.encryptedPassword,
      }).get();

      if (!user) throw new Error('USER_UPSERT_FAILED');

      commitRealSchoolLoginContext(tx, {
        userId: user.id,
        casCookieJar: input.credentials.casCookieJar,
        portalToken: input.credentials.portalToken,
        jwCookieJar: input.credentials.jwCookieJar,
        at: input.at,
      });

      return user;
    });
  }
}
