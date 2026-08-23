/**
 * [INPUT]: 依赖 credentials 表、SchoolLoginEpoch、共享 CookieJar codec 与 Drizzle 条件写入，持久化最小 mobile accessToken/CookieJar
 * [OUTPUT]: 对外提供 MobileYxtSessionRepository/Store、SqliteMobileYxtSessionRepository，支持安全 read、epoch 条件创建与 generation 条件失效
 * [POS]: mobile-yxt 自有会话存储边界；损坏或越权 CookieJar 在读取事务内淘汰为 miss，无 TTL、epoch 和 generation 语义不进入通用 CredentialManager
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { readSchoolLoginEpoch } from '../credential-recovery/school-login-context';
import {
  decodeMobileYxtCookieJar,
  requireMobileYxtCookieJar,
} from './session-cookie-codec';

const MOBILE_YXT_SESSION_SYSTEM = 'derived_session:mobile_yxt';
const SESSION_VALUE_VERSION = 1;

interface StoredSessionValue {
  v: typeof SESSION_VALUE_VERSION;
  accessToken: string;
  loginEpoch: number;
  generation: string;
}

export interface MobileYxtStoredSession {
  accessToken: string;
  cookieJar: string;
  loginEpoch: number;
  generation: string;
}

export interface MobileYxtSessionRepository {
  read(userId: number): Promise<MobileYxtStoredSession | null>;
  createIfLoginEpochMatches(input: {
    userId: number;
    expectedLoginEpoch: number;
    accessToken: string;
    cookieJar: string;
  }): Promise<MobileYxtStoredSession | null>;
  invalidateGeneration(userId: number, generation: string): Promise<boolean>;
}

export type MobileYxtSessionStore = MobileYxtSessionRepository;

function decodeStoredValue(value: string | null): StoredSessionValue | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredSessionValue>;
    if (
      parsed.v !== SESSION_VALUE_VERSION
      || typeof parsed.accessToken !== 'string'
      || !parsed.accessToken.trim()
      || !Number.isSafeInteger(parsed.loginEpoch)
      || Number(parsed.loginEpoch) < 0
      || typeof parsed.generation !== 'string'
      || !parsed.generation
    ) return null;
    return parsed as StoredSessionValue;
  } catch {
    return null;
  }
}

export class SqliteMobileYxtSessionRepository implements MobileYxtSessionRepository {
  async read(userId: number): Promise<MobileYxtStoredSession | null> {
    return getDb().transaction((tx) => {
      const epoch = readSchoolLoginEpoch(tx, userId);
      const row = tx.select().from(schema.credentials).where(and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.system, MOBILE_YXT_SESSION_SYSTEM),
      )).limit(1).get();
      if (!row) return null;

      const stored = decodeStoredValue(row.value);
      const decodedCookieJar = row.cookieJar ? decodeMobileYxtCookieJar(row.cookieJar) : null;
      if (!stored || !decodedCookieJar || stored.loginEpoch !== epoch || row.expiresAt !== null) {
        tx.delete(schema.credentials).where(eq(schema.credentials.id, row.id)).run();
        return null;
      }
      return {
        accessToken: stored.accessToken,
        cookieJar: decodedCookieJar.serialized,
        loginEpoch: stored.loginEpoch,
        generation: stored.generation,
      };
    });
  }

  async createIfLoginEpochMatches(input: {
    userId: number;
    expectedLoginEpoch: number;
    accessToken: string;
    cookieJar: string;
  }): Promise<MobileYxtStoredSession | null> {
    const cookieJar = requireMobileYxtCookieJar(input.cookieJar).serialized;
    return getDb().transaction((tx) => {
      if (readSchoolLoginEpoch(tx, input.userId) !== input.expectedLoginEpoch) return null;

      const generation = randomUUID();
      const now = new Date();
      const value = JSON.stringify({
        v: SESSION_VALUE_VERSION,
        accessToken: input.accessToken,
        loginEpoch: input.expectedLoginEpoch,
        generation,
      } satisfies StoredSessionValue);

      tx.insert(schema.credentials).values({
        userId: input.userId,
        system: MOBILE_YXT_SESSION_SYSTEM,
        value,
        cookieJar,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [schema.credentials.userId, schema.credentials.system],
        set: { value, cookieJar, expiresAt: null, updatedAt: now },
      }).run();

      return {
        accessToken: input.accessToken,
        cookieJar,
        loginEpoch: input.expectedLoginEpoch,
        generation,
      };
    });
  }

  async invalidateGeneration(userId: number, generation: string): Promise<boolean> {
    return getDb().transaction((tx) => {
      const row = tx.select({ id: schema.credentials.id, value: schema.credentials.value })
        .from(schema.credentials)
        .where(and(
          eq(schema.credentials.userId, userId),
          eq(schema.credentials.system, MOBILE_YXT_SESSION_SYSTEM),
        ))
        .limit(1)
        .get();
      if (!row || decodeStoredValue(row.value)?.generation !== generation) return false;
      tx.delete(schema.credentials).where(eq(schema.credentials.id, row.id)).run();
      return true;
    });
  }
}

export const mobileYxtSessionRepository = new SqliteMobileYxtSessionRepository();
