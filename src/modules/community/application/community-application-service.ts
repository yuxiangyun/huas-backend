/**
 * [INPUT]: 依赖 Identity 只读端口、Community 资料仓储/头像端口与纯领域规则
 * [OUTPUT]: 对外提供 CommunityApplicationService，完成批量作者投影、资料读写与头像补偿
 * [POS]: modules/community/application 的唯一用例服务，同时实现社交消费者所需 CommunityProfileReader
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';
import type { CommunityIdentityReader } from '../../identity/domain/community-identity-reader';
import {
  normalizeCommunityNickname,
  toCommunityProfile,
  type CommunityProfile,
  type StoredCommunityProfile,
} from '../domain/community';
import type {
  CommunityAvatarStorage,
  CommunityProfileReader,
  CommunityProfileRepository,
} from '../domain/ports';

function normalizeUserIds(userIds: readonly number[]) {
  return Array.from(new Set(userIds.filter((userId) => Number.isInteger(userId) && userId > 0)));
}

export interface UpdateCommunityProfileInput {
  nickname?: unknown;
  avatar?: File;
  clearAvatar?: boolean;
}

export class CommunityApplicationService implements CommunityProfileReader {
  constructor(
    private readonly identities: CommunityIdentityReader,
    private readonly profiles: CommunityProfileRepository,
    private readonly avatars: CommunityAvatarStorage,
  ) {}

  async getMany(userIds: readonly number[]): Promise<Map<number, CommunityProfile>> {
    const normalized = normalizeUserIds(userIds);
    if (normalized.length === 0) return new Map();

    const [identities, profiles] = await Promise.all([
      this.identities.getMany(normalized),
      this.profiles.getMany(normalized),
    ]);
    const result = new Map<number, CommunityProfile>();
    for (const userId of normalized) {
      const identity = identities.get(userId);
      if (identity) result.set(userId, toCommunityProfile(identity, profiles.get(userId)));
    }
    return result;
  }

  async getProfile(userId: number) {
    return (await this.getMany([userId])).get(userId) ?? null;
  }

  async updateProfile(userId: number, input: UpdateCommunityProfileInput) {
    const identity = (await this.identities.getMany([userId])).get(userId);
    if (!identity) throw new AppError(ErrorCode.PARAM_ERROR, '用户不存在');
    if (input.avatar && input.clearAvatar) {
      throw new AppError(ErrorCode.PARAM_ERROR, '不能同时上传和删除头像');
    }

    const existing = (await this.profiles.getMany([userId])).get(userId);
    const nickname = input.nickname === undefined
      ? existing?.nickname ?? null
      : normalizeCommunityNickname(input.nickname);
    let avatarUrl = existing?.avatarUrl ?? null;
    let candidateAvatarUrl: string | null = null;

    if (input.avatar) {
      candidateAvatarUrl = await this.avatars.storeAvatar(userId, input.avatar);
      avatarUrl = candidateAvatarUrl;
    } else if (input.clearAvatar) {
      avatarUrl = null;
    }

    const stored: StoredCommunityProfile = { userId, nickname, avatarUrl };
    try {
      await this.profiles.save(stored);
    } catch (error) {
      if (candidateAvatarUrl) {
        try {
          await this.avatars.removeAvatar(candidateAvatarUrl);
        } catch (cleanupError) {
          const detail = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
          Logger.warn('CommunityAvatar', `候选头像补偿清理失败 userId=${userId}`, detail);
        }
      }
      throw error;
    }

    if (existing?.avatarUrl && existing.avatarUrl !== avatarUrl) {
      try {
        await this.avatars.removeAvatar(existing.avatarUrl);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        Logger.warn('CommunityAvatar', `旧头像清理失败 userId=${userId}`, detail);
      }
    }
    return toCommunityProfile(identity, stored);
  }

  clearAvatar(userId: number) {
    return this.updateProfile(userId, { clearAvatar: true });
  }
}
