/**
 * [INPUT]: 依赖 SQLite/Drizzle 用户表、共享学校上下文事务原语与在途认证排序
 * [OUTPUT]: 对外提供内部 SchoolStateStore，读取不可变快照、真实认证及目标换票条件提交、交互标记与条件删除
 * [POS]: SchoolAccess 的事实提交边界，真实登录和静默认证共用；不签 JWT，不保存业务缓存
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { AppError, ErrorCode } from '../../../utils/errors';
import { commitRealSchoolLoginContext, readSchoolLoginEpoch, upsertBaseCredential } from './school-login-context';
import { authenticationAttempts, type AuthenticationAttempt } from './authentication-attempts';

export interface SchoolIdentity {
  id: number;
  studentId: string;
  name: string | null;
  className: string | null;
}

const identityColumns = {
  id: schema.users.id, studentId: schema.users.studentId,
  name: schema.users.name, className: schema.users.className,
};

export type BaseSchoolTarget = 'cas_tgc' | 'portal_jwt' | 'jw_session';
export interface SchoolCredentialSnapshot {
  readonly userId: number;
  readonly system: BaseSchoolTarget;
  readonly epoch: number;
  readonly id: number;
  readonly value: string | null;
  readonly cookieJar: string | null;
  readonly updatedAt: number;
  readonly expiresAt: number;
}

function matches(row: typeof schema.credentials.$inferSelect | undefined, snapshot: SchoolCredentialSnapshot): boolean {
  return !!row && row.id === snapshot.id && row.value === snapshot.value && row.cookieJar === snapshot.cookieJar
    && row.updatedAt.getTime() === snapshot.updatedAt && row.expiresAt?.getTime() === snapshot.expiresAt;
}

export class SchoolStateStore {
  epoch(userId: number): number { return readSchoolLoginEpoch(getDb(), userId); }

  read(userId: number, system: BaseSchoolTarget): SchoolCredentialSnapshot | null {
    return getDb().transaction(tx => {
      const row = tx.select().from(schema.credentials).where(and(eq(schema.credentials.userId, userId), eq(schema.credentials.system, system))).get();
      if (!row?.expiresAt || row.expiresAt.getTime() <= Date.now()) return null;
      if (system === 'portal_jwt' ? !row.value : !row.cookieJar) return null;
      return Object.freeze({ userId, system, epoch: readSchoolLoginEpoch(tx, userId), id: row.id, value: row.value, cookieJar: row.cookieJar, updatedAt: row.updatedAt.getTime(), expiresAt: row.expiresAt.getTime() });
    });
  }

  account(userId: number) {
    return getDb().transaction(tx => {
      const user = tx.select({ ...identityColumns, encryptedPassword: schema.users.encryptedPassword }).from(schema.users).where(eq(schema.users.id, userId)).get();
      return user ? { ...user, epoch: readSchoolLoginEpoch(tx, userId) } : null;
    });
  }

  requiresInteraction(userId: number): boolean {
    return Boolean(getDb().select({ id: schema.credentials.id }).from(schema.credentials).where(and(
      eq(schema.credentials.userId, userId), eq(schema.credentials.system, 'interactive_login_required'),
    )).get());
  }

  commitAuthentication(input: {
    attempt: AuthenticationAttempt;
    encryptedPassword: string;
    casCookieJar: string;
    portalToken: string | null;
    expectedEpoch?: number;
  }): SchoolIdentity {
    const result = getDb().transaction((tx) => {
      const current = tx.select(identityColumns).from(schema.users)
        .where(eq(schema.users.studentId, input.attempt.studentId)).get();
      if (!authenticationAttempts.canCommit(input.attempt)
        || (input.expectedEpoch !== undefined && (!current || readSchoolLoginEpoch(tx, current.id) !== input.expectedEpoch))) {
        if (!current) throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '学校身份已更新，请稍后重试');
        return { user: current, committed: false };
      }
      const at = new Date();
      const user = tx.insert(schema.users).values({
        studentId: input.attempt.studentId, encryptedPassword: input.encryptedPassword,
        name: null, className: null, createdAt: at, lastLoginAt: at, lastActiveAt: at,
      }).onConflictDoUpdate({
        target: schema.users.studentId,
        set: { encryptedPassword: input.encryptedPassword, lastLoginAt: at, lastActiveAt: at },
      }).returning(identityColumns).get();
      if (!user) throw new Error('USER_UPSERT_FAILED');
      commitRealSchoolLoginContext(tx, {
        userId: user.id, casCookieJar: input.casCookieJar, portalToken: input.portalToken,
        at,
      });
      // 事务回调内没有 await，排序检查、持久化与标记之间不会插入其他认证提交。
      return { user, committed: true };
    });
    if (result.committed) authenticationAttempts.committed(input.attempt);
    return result.user;
  }

  commitExchange(parent: SchoolCredentialSnapshot, system: 'portal_jwt' | 'jw_session', jar: string, value: string | null): SchoolCredentialSnapshot | null {
    const committed = getDb().transaction(tx => {
      if (readSchoolLoginEpoch(tx, parent.userId) !== parent.epoch) return false;
      const current = tx.select().from(schema.credentials).where(and(eq(schema.credentials.userId, parent.userId), eq(schema.credentials.system, 'cas_tgc'))).get();
      if (!matches(current, parent)) return false;
      const at = new Date();
      upsertBaseCredential(tx, { userId: parent.userId, system: 'cas_tgc', value: null, cookieJar: jar, at });
      upsertBaseCredential(tx, { userId: parent.userId, system, value, cookieJar: system === 'jw_session' ? jar : null, at });
      return true;
    });
    return committed ? this.read(parent.userId, system) : null;
  }

  invalidate(snapshot: SchoolCredentialSnapshot): boolean {
    return getDb().transaction(tx => {
      if (readSchoolLoginEpoch(tx, snapshot.userId) !== snapshot.epoch) return false;
      const current = tx.select().from(schema.credentials).where(and(eq(schema.credentials.userId, snapshot.userId), eq(schema.credentials.system, snapshot.system))).get();
      if (!matches(current, snapshot)) return false;
      tx.delete(schema.credentials).where(eq(schema.credentials.id, snapshot.id)).run();
      return true;
    });
  }

  markInteraction(userId: number, expectedEpoch: number, reason: 'captcha_required' | 'credentials_rejected'): boolean {
    return getDb().transaction(tx => {
      if (readSchoolLoginEpoch(tx, userId) !== expectedEpoch) return false;
      tx.delete(schema.credentials).where(and(eq(schema.credentials.userId, userId), inArray(schema.credentials.system, ['cas_tgc', 'portal_jwt', 'jw_session']))).run();
      const at = new Date();
      tx.insert(schema.credentials).values({ userId, system: 'interactive_login_required', value: reason, cookieJar: null, expiresAt: null, createdAt: at, updatedAt: at })
        .onConflictDoUpdate({ target: [schema.credentials.userId, schema.credentials.system], set: { value: reason, updatedAt: at } }).run();
      return true;
    });
  }

  cleanupExpired(): void {
    getDb().run(sql`DELETE FROM credentials WHERE expires_at IS NOT NULL AND expires_at < ${Date.now()}`);
  }
}

export const schoolStateStore = new SchoolStateStore();
