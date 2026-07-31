/**
 * [INPUT]: 依赖 Identity 的最小 id/className 投影，不依赖 HTTP、数据库或文件系统
 * [OUTPUT]: 对外提供 Community 公共资料 DTO、存储 DTO、昵称规范化与默认 displayName 规则
 * [POS]: modules/community/domain 的纯规则内核，把公开资料严格收敛为 id/displayName/avatarUrl
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import type { CommunityIdentity } from '../../identity/domain/community-identity-reader';

export interface CommunityProfile {
  id: number;
  displayName: string;
  avatarUrl: string | null;
}

export interface StoredCommunityProfile {
  userId: number;
  nickname: string | null;
  avatarUrl: string | null;
}

export function normalizeCommunityNickname(value: unknown): string | null {
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.PARAM_ERROR, '昵称必须是字符串');
  }
  return value.trim() || null;
}

export function buildDefaultDisplayName(userId: number, className: string | null | undefined): string {
  const normalized = className?.trim() || '';
  const firstDigitIndex = normalized.search(/\d/u);
  const prefix = (firstDigitIndex >= 0 ? normalized.slice(0, firstDigitIndex) : normalized).trim();
  return prefix ? `${prefix}同学${userId}` : `文理er ${userId}`;
}

export function toCommunityProfile(
  identity: CommunityIdentity,
  stored: StoredCommunityProfile | undefined,
): CommunityProfile {
  return {
    id: identity.id,
    displayName: stored?.nickname?.trim() || buildDefaultDisplayName(identity.id, identity.className),
    avatarUrl: stored?.avatarUrl || null,
  };
}
