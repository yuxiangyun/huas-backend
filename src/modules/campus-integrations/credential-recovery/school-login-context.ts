/**
 * [INPUT]: 依赖 credentials 表与 Drizzle SQLite executor，使用内部学校登录上下文记录和派生会话命名空间
 * [OUTPUT]: 对外提供 SchoolLoginEpochReader、readSchoolLoginEpoch 与 advanceSchoolLoginEpoch，真实 CAS 登录可原子推进 epoch 并清理旧派生会话
 * [POS]: credential-recovery 的学校登录上下文边界；Identity 只表达“真实学校登录已发生”，不感知任何具体派生业务会话
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq, like } from 'drizzle-orm';
import { getDb, schema } from '../../../db';

export type SchoolLoginDatabase = ReturnType<typeof getDb>;
export type SchoolLoginTransaction = Parameters<Parameters<SchoolLoginDatabase['transaction']>[0]>[0];
type SchoolLoginExecutor = SchoolLoginDatabase | SchoolLoginTransaction;

const SCHOOL_LOGIN_EPOCH_SYSTEM = 'school_login_epoch';
const DERIVED_SESSION_PATTERN = 'derived_session:%';

function parseEpoch(value: string | null | undefined): number {
  const epoch = Number(value);
  return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;
}

export interface SchoolLoginEpochReader {
  read(userId: number): Promise<number>;
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
    like(schema.credentials.system, DERIVED_SESSION_PATTERN),
  )).run();
  return nextEpoch;
}

export class SqliteSchoolLoginEpochReader implements SchoolLoginEpochReader {
  async read(userId: number): Promise<number> {
    return readSchoolLoginEpoch(getDb(), userId);
  }
}
