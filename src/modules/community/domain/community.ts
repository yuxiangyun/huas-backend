/**
 * [INPUT]: 依赖 Identity 的最小 id/className 投影，不依赖 HTTP、数据库或文件系统
 * [OUTPUT]: 对外提供 Community 公共/当前资料 DTO、存储 DTO、昵称校验与默认 displayName 规则
 * [POS]: modules/community/domain 的纯规则内核，隔离三字段公共投影与含 nickname 的本人编辑投影
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import type { CommunityIdentity } from '../../identity/domain/community-identity-reader';

const RESERVED_COMMUNITY_NICKNAMES = new Set(['管理员', '官方', '系统', '匿名用户']);

export interface CommunityProfile {
  id: number;
  displayName: string;
  avatarUrl: string | null;
}

export interface CurrentCommunityProfile extends CommunityProfile {
  nickname: string | null;
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
  const normalized = value.trim();
  if (!normalized) return null;
  const length = Array.from(normalized).length;
  if (length < 2 || length > 12) {
    throw new AppError(ErrorCode.PARAM_ERROR, '昵称长度必须为 2 到 12 个字符');
  }
  if (/[\p{C}\p{Zl}\p{Zp}]/u.test(normalized)) {
    throw new AppError(ErrorCode.PARAM_ERROR, '昵称不能包含控制字符或换行');
  }
  if (RESERVED_COMMUNITY_NICKNAMES.has(normalized)) {
    throw new AppError(ErrorCode.PARAM_ERROR, '该昵称为系统保留名称');
  }
  return normalized;
}

export function buildDefaultDisplayName(userId: number, className: string | null | undefined): string {
  const normalized = className?.trim() || '';
  const firstDigitIndex = normalized.search(/\p{N}/u);
  const prefix = firstDigitIndex > 0 ? normalized.slice(0, firstDigitIndex).trim() : '';
  if (/[\p{C}\p{Zl}\p{Zp}]/u.test(prefix)) return `文理er ${userId}`;
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

export function toCurrentCommunityProfile(
  identity: CommunityIdentity,
  stored: StoredCommunityProfile | undefined,
): CurrentCommunityProfile {
  return {
    ...toCommunityProfile(identity, stored),
    nickname: stored?.nickname ?? null,
  };
}
