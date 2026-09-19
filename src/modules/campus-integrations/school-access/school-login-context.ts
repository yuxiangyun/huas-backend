/**
 * [INPUT]: 依赖 credentials 表、config 基础凭证 TTL 与 Drizzle SQLite executor，使用内部学校登录上下文记录和严格派生会话命名空间
 * [OUTPUT]: 对外提供 epoch 读取/推进、统一基础凭证写入与 commitRealSchoolLoginContext，原子提交真实 CAS 获得的基础凭证并清理旧派生会话
 * [POS]: SchoolAccess 的真实学校登录事务原语；真实认证与静默恢复共同表达一次 CAS 成功，不复制凭证写入或感知具体派生业务会话
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq, sql } from 'drizzle-orm';
import { config } from '../../../config';
import { getDb, schema } from '../../../db';

export type SchoolLoginDatabase = ReturnType<typeof getDb>;
export type SchoolLoginTransaction = Parameters<Parameters<SchoolLoginDatabase['transaction']>[0]>[0];
type SchoolLoginExecutor = SchoolLoginDatabase | SchoolLoginTransaction;

const SCHOOL_LOGIN_EPOCH_SYSTEM = 'school_login_epoch';
const DERIVED_SESSION_GLOB = 'derived_session:*';
const INTERACTIVE_LOGIN_REQUIRED_SYSTEM = 'interactive_login_required';

export interface RealSchoolLoginContext {
  userId: number;
  casCookieJar: string;
  portalToken: string | null;
  at: Date;
}

function parseEpoch(value: string | null | undefined): number {
  const epoch = Number(value);
  return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;
}

export function readSchoolLoginEpoch(executor: SchoolLoginExecutor, userId: number): number {
  const row = executor.select({ value: schema.credentials.value })
    .from(schema.credentials)
    .where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, SCHOOL_LOGIN_EPOCH_SYSTEM),
    ))
    .limit(1)
    .get();
  return parseEpoch(row?.value);
}

export function advanceSchoolLoginEpoch(
  executor: SchoolLoginExecutor,
  userId: number,
  at: Date,
): number {
  const nextEpoch = readSchoolLoginEpoch(executor, userId) + 1;
  executor.insert(schema.credentials).values({
    userId,
    system: SCHOOL_LOGIN_EPOCH_SYSTEM,
    value: String(nextEpoch),
    cookieJar: null,
    expiresAt: null,
    createdAt: at,
    updatedAt: at,
  }).onConflictDoUpdate({
    target: [schema.credentials.userId, schema.credentials.system],
    set: { value: String(nextEpoch), updatedAt: at },
  }).run();

  // 真实 CAS 登录重建了学校账号上下文；所有旧 epoch 派生会话都必须在同一事务消失。
  executor.delete(schema.credentials).where(and(
    eq(schema.credentials.userId, userId),
    sql`${schema.credentials.system} GLOB ${DERIVED_SESSION_GLOB}`,
  )).run();
  return nextEpoch;
}

export function upsertBaseCredential(
  executor: SchoolLoginExecutor,
  input: {
    userId: number;
    system: 'cas_tgc' | 'portal_jwt' | 'jw_session';
    value: string | null;
    cookieJar: string | null;
    at: Date;
  },
): void {
  const ttl = { cas_tgc: config.ttl.tgc, portal_jwt: config.ttl.portalJwt, jw_session: config.ttl.jwSession }[input.system];
  const expiresAt = new Date(input.at.getTime() + ttl);
  executor.insert(schema.credentials).values({
    userId: input.userId,
    system: input.system,
    value: input.value,
    cookieJar: input.cookieJar,
    expiresAt,
    createdAt: input.at,
    updatedAt: input.at,
  }).onConflictDoUpdate({
    target: [schema.credentials.userId, schema.credentials.system],
    set: {
      value: input.value,
      cookieJar: input.cookieJar,
      expiresAt,
      updatedAt: input.at,
    },
  }).run();
}

export function commitRealSchoolLoginContext(
  executor: SchoolLoginExecutor,
  input: RealSchoolLoginContext,
): number {
  const epoch = advanceSchoolLoginEpoch(executor, input.userId, input.at);
  upsertBaseCredential(executor, {
    userId: input.userId,
    system: 'cas_tgc',
    value: null,
    cookieJar: input.casCookieJar,
    at: input.at,
  });

  if (input.portalToken) {
    upsertBaseCredential(executor, {
      userId: input.userId,
      system: 'portal_jwt',
      value: input.portalToken,
      cookieJar: null,
      at: input.at,
    });
  } else {
    executor.delete(schema.credentials).where(and(
      eq(schema.credentials.userId, input.userId),
      eq(schema.credentials.system, 'portal_jwt'),
    )).run();
  }

  // CAS-only 提交保留既有 JW 会话；请求该能力时再由目标协议验证和恢复。
  executor.delete(schema.credentials).where(and(
    eq(schema.credentials.userId, input.userId),
    eq(schema.credentials.system, INTERACTIVE_LOGIN_REQUIRED_SYSTEM),
  )).run();
  return epoch;
}
