/**
 * [INPUT]: 依赖 credentials 表、真实登录 epoch、Drizzle 事务、UUID 与 H5 token 校验
 * [OUTPUT]: 对外提供 MobileJwSessionRepository 与 SQLite 实现，提供 epoch 条件创建和 generation 条件失效
 * [POS]: mobile-jw 的 token-only 派生会话事实源，损坏或旧 epoch 行事务淘汰，不进入基础凭证 TTL 管理
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { readSchoolLoginEpoch } from '../credential-recovery/school-login-context';
import { isValidH5Token } from './auth-exchanger';
import { protocolFailure } from './errors';

const SESSION_SYSTEM = 'derived_session:mobile_jw';

export interface MobileJwSession {
  token: string;
  loginEpoch: number;
  generation: string;
}

export interface MobileJwSessionRepository {
  read(userId: number): Promise<MobileJwSession | null>;
  createIfLoginEpochMatches(userId: number, epoch: number, token: string): Promise<MobileJwSession | null>;
  invalidateGeneration(userId: number, generation: string): Promise<void>;
}

function decode(value: string | null): MobileJwSession | null {
  try {
    const parsed = JSON.parse(value || 'null');
    if (!parsed || parsed.v !== 1 || !isValidH5Token(parsed.token)
      || !Number.isSafeInteger(parsed.loginEpoch) || parsed.loginEpoch < 0
      || typeof parsed.generation !== 'string' || !parsed.generation) return null;
    return { token: parsed.token, loginEpoch: parsed.loginEpoch, generation: parsed.generation };
  } catch {
    return null;
  }
}

export class SqliteMobileJwSessionRepository implements MobileJwSessionRepository {
  async read(userId: number): Promise<MobileJwSession | null> {
    return getDb().transaction((tx) => {
      const row = tx.select().from(schema.credentials).where(and(
        eq(schema.credentials.userId, userId), eq(schema.credentials.system, SESSION_SYSTEM),
      )).get();
      if (!row) return null;
      const session = decode(row.value);
      if (!session || row.cookieJar !== null || row.expiresAt !== null
        || session.loginEpoch !== readSchoolLoginEpoch(tx, userId)) {
        tx.delete(schema.credentials).where(eq(schema.credentials.id, row.id)).run();
        return null;
      }
      return session;
    });
  }

  async createIfLoginEpochMatches(userId: number, epoch: number, token: string): Promise<MobileJwSession | null> {
    if (!isValidH5Token(token)) throw protocolFailure();
    return getDb().transaction((tx) => {
      if (epoch !== readSchoolLoginEpoch(tx, userId)) return null;
      const session = { token, loginEpoch: epoch, generation: randomUUID() };
      const now = new Date();
      const value = JSON.stringify({ v: 1, ...session });
      tx.insert(schema.credentials).values({
        userId, system: SESSION_SYSTEM, value, cookieJar: null, expiresAt: null,
        createdAt: now, updatedAt: now,
      }).onConflictDoUpdate({
        target: [schema.credentials.userId, schema.credentials.system],
        set: { value, cookieJar: null, expiresAt: null, updatedAt: now },
      }).run();
      return session;
    });
  }

  async invalidateGeneration(userId: number, generation: string): Promise<void> {
    getDb().transaction((tx) => {
      const row = tx.select().from(schema.credentials).where(and(
        eq(schema.credentials.userId, userId), eq(schema.credentials.system, SESSION_SYSTEM),
      )).get();
      if (row && decode(row.value)?.generation === generation) {
        tx.delete(schema.credentials).where(eq(schema.credentials.id, row.id)).run();
      }
    });
  }
}

export const mobileJwSessionRepository = new SqliteMobileJwSessionRepository();
