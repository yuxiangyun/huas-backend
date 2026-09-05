/**
 * [INPUT]: 依赖 CredentialManager 的 Portal-only 恢复能力、credentials 表与 SchoolLoginEpoch 上下文
 * [OUTPUT]: 对外提供 PortalCredentialReader 与 CredentialManagerPortalCredentialReader，原子读取 Portal JWT/真实登录 epoch，并条件拒绝上游明确判无效的当前 JWT
 * [POS]: mobile-yxt/mobile-jw 到基础学校凭证的共享窄端口；只失效被上游明确拒绝且仍为当前值的 Portal JWT，不读取、不激活、不覆盖也不失效 JW Session
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import { CredentialManager } from './credential-manager';
import { readSchoolLoginEpoch } from './school-login-context';

export interface PortalCredentialSnapshot {
  portalJwt: string;
  loginEpoch: number;
}

export interface PortalCredentialReader {
  readOrRestore(userId: number, deadlineAt: number): Promise<PortalCredentialSnapshot | null>;
  rejectIfCurrent(userId: number, portalJwt: string): Promise<void>;
}

function readCurrentSnapshot(userId: number): PortalCredentialSnapshot | null {
  return getDb().transaction((tx) => {
    const credential = tx.select({
      value: schema.credentials.value,
      expiresAt: schema.credentials.expiresAt,
    }).from(schema.credentials).where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, 'portal_jwt'),
    )).limit(1).get();
    if (
      !credential?.value
      || !credential.expiresAt
      || credential.expiresAt.getTime() <= Date.now()
    ) return null;
    return {
      portalJwt: credential.value,
      loginEpoch: readSchoolLoginEpoch(tx, userId),
    };
  });
}

export class CredentialManagerPortalCredentialReader implements PortalCredentialReader {
  async readOrRestore(userId: number, deadlineAt: number): Promise<PortalCredentialSnapshot | null> {
    const current = readCurrentSnapshot(userId);
    if (current) return current;

    // requiredSystem=portal_jwt 的恢复链只触碰 CAS/Portal，不激活 JW。
    await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId, deadlineAt);
    return readCurrentSnapshot(userId);
  }

  async rejectIfCurrent(userId: number, portalJwt: string): Promise<void> {
    await getDb().delete(schema.credentials).where(and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.system, 'portal_jwt'),
      eq(schema.credentials.value, portalJwt),
    ));
  }
}

export const portalCredentialReader = new CredentialManagerPortalCredentialReader();
