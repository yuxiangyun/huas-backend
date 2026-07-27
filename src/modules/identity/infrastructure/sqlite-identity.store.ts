/**
 * [INPUT]: 依赖 db/getDb/schema、Drizzle 条件构造器、config 凭证 TTL 与 IdentityStorePort
 * [OUTPUT]: 对外提供 SqliteIdentityStore，查询/触碰登录用户并原子提交用户与学校凭证
 * [POS]: identity/infrastructure 的持久化边界，是登录用户与 CAS/Portal/JW 凭证一致性的唯一事务所有者
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq } from 'drizzle-orm';
import { config } from '../../../config';
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

  async persistSchoolLogin(input: Parameters<IdentityStorePort['persistSchoolLogin']>[0]): Promise<LoginUser> {
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

      const credentials = [
        {
          system: 'cas_tgc',
          value: null,
          cookieJar: input.credentials.casCookieJar,
          ttlMs: config.ttl.tgc,
        },
        ...(input.credentials.portalToken ? [{
          system: 'portal_jwt',
          value: input.credentials.portalToken,
          cookieJar: null,
          ttlMs: config.ttl.portalJwt,
        }] : []),
        ...(input.credentials.jwCookieJar ? [{
          system: 'jw_session',
          value: null,
          cookieJar: input.credentials.jwCookieJar,
          ttlMs: config.ttl.jwSession,
        }] : []),
      ];

      for (const credential of credentials) {
        const expiresAt = new Date(input.at.getTime() + credential.ttlMs);
        tx.insert(schema.credentials).values({
          userId: user.id,
          system: credential.system,
          value: credential.value,
          cookieJar: credential.cookieJar,
          expiresAt,
          createdAt: input.at,
          updatedAt: input.at,
        }).onConflictDoUpdate({
          target: [schema.credentials.userId, schema.credentials.system],
          set: {
            value: credential.value,
            cookieJar: credential.cookieJar,
            expiresAt,
            updatedAt: input.at,
          },
        }).run();
      }

      tx.delete(schema.credentials).where(and(
        eq(schema.credentials.userId, user.id),
        eq(schema.credentials.system, 'interactive_login_required'),
      )).run();

      return user;
    });
  }
}
