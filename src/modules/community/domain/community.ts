/**
 * [INPUT]: 依赖 Identity 的最小 id/className 投影，不依赖 HTTP、数据库或文件系统
 * [OUTPUT]: 对外提供 Community 三字段作者/含 Bio 详细与当前资料 DTO、存储 DTO、资料文本校验及默认 displayName 规则
 * [POS]: modules/community/domain 的纯规则内核，隔离稳定作者投影与含 Bio 的详细公开/本人编辑投影
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import type { CommunityIdentity } from '../../identity/domain/community-identity-reader';

const RESERVED_COMMUNITY_NICKNAMES = new Set(['管理员', '官方', '系统', '匿名用户']);
export const COMMUNITY_BIO_MAX_LENGTH = 80;

export interface CommunityProfile {
  id: number;
  displayName: string;
  avatarUrl: string | null;
}

export interface DetailedCommunityProfile extends CommunityProfile {
  bio: string | null;
}

export interface CurrentCommunityProfile extends DetailedCommunityProfile {
  nickname: string | null;
}

export interface StoredCommunityProfile {
  userId: number;
  nickname: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

export function normalizeCommunityBio(value: unknown): string | null {
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.PARAM_ERROR, 'Bio 必须是字符串');
  }
  if (/[\r\n\p{C}\p{Zl}\p{Zp}]/u.test(value)) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'Bio 只能包含单行纯文本');
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (Array.from(normalized).length > COMMUNITY_BIO_MAX_LENGTH) {
    throw new AppError(ErrorCode.PARAM_ERROR, `Bio 长度不能超过 ${COMMUNITY_BIO_MAX_LENGTH} 个字符`);
  }
  return normalized;
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
    ...toDetailedCommunityProfile(identity, stored),
    nickname: stored?.nickname ?? null,
  };
}

export function toDetailedCommunityProfile(
  identity: CommunityIdentity,
  stored: StoredCommunityProfile | undefined,
): DetailedCommunityProfile {
  return {
    ...toCommunityProfile(identity, stored),
    bio: stored?.bio ?? null,
  };
}
