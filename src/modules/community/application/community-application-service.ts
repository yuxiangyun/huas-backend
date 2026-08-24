/**
 * [INPUT]: 依赖 Identity 只读端口、Community 资料仓储/头像端口与纯领域规则
 * [OUTPUT]: 对外提供 CommunityApplicationService，分别完成三字段作者/含 Bio 详细资料投影、字段级资料更新与头像生命周期
 * [POS]: modules/community/application 的唯一用例服务，以窄 reader 隔离消费者并用资料 patch 保持并发字段安全
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';
import type { CommunityIdentityReader } from '../../identity/domain/community-identity-reader';
import {
  normalizeCommunityBio,
  normalizeCommunityNickname,
  toCommunityProfile,
  toCurrentCommunityProfile,
  toDetailedCommunityProfile,
  type CommunityProfile,
  type DetailedCommunityProfile,
} from '../domain/community';
import type {
  CommunityAvatarStorage,
  CommunityDetailedProfileReader,
  CommunityProfilePatch,
  CommunityProfilePatchResult,
  CommunityProfileReader,
  CommunityProfileRepository,
} from '../domain/ports';

function normalizeUserIds(userIds: readonly number[]) {
  return Array.from(new Set(userIds.filter((userId) => Number.isInteger(userId) && userId > 0)));
}

export interface UpdateCommunityProfileInput {
  nickname?: unknown;
  bio?: unknown;
  avatar?: File;
  clearAvatar?: boolean;
}

export class CommunityApplicationService implements CommunityProfileReader, CommunityDetailedProfileReader {
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
    return (await this.getManyDetailed([userId])).get(userId) ?? null;
  }

  async getManyDetailed(userIds: readonly number[]): Promise<Map<number, DetailedCommunityProfile>> {
    const normalized = normalizeUserIds(userIds);
    if (normalized.length === 0) return new Map();

    const [identities, profiles] = await Promise.all([
      this.identities.getMany(normalized),
      this.profiles.getMany(normalized),
    ]);
    const result = new Map<number, DetailedCommunityProfile>();
    for (const userId of normalized) {
      const identity = identities.get(userId);
      if (identity) result.set(userId, toDetailedCommunityProfile(identity, profiles.get(userId)));
    }
    return result;
  }

  async getCurrentProfile(userId: number) {
    const [identities, profiles] = await Promise.all([
      this.identities.getMany([userId]),
      this.profiles.getMany([userId]),
    ]);
    const identity = identities.get(userId);
    return identity ? toCurrentCommunityProfile(identity, profiles.get(userId)) : null;
  }

  async updateProfile(userId: number, input: UpdateCommunityProfileInput) {
    const identity = (await this.identities.getMany([userId])).get(userId);
    if (!identity) throw new AppError(ErrorCode.PARAM_ERROR, '用户不存在');
    if (input.avatar && input.clearAvatar) {
      throw new AppError(ErrorCode.PARAM_ERROR, '不能同时上传和删除头像');
    }

    const patch: CommunityProfilePatch = {};
    if (input.nickname !== undefined) {
      patch.nickname = normalizeCommunityNickname(input.nickname);
    }
    if (input.bio !== undefined) {
      patch.bio = normalizeCommunityBio(input.bio);
    }
    let candidateAvatarUrl: string | null = null;

    if (input.avatar) {
      candidateAvatarUrl = await this.avatars.storeAvatar(userId, input.avatar);
      patch.avatarUrl = candidateAvatarUrl;
    } else if (input.clearAvatar) {
      patch.avatarUrl = null;
    }
    if (!Object.prototype.hasOwnProperty.call(patch, 'nickname')
      && !Object.prototype.hasOwnProperty.call(patch, 'bio')
      && !Object.prototype.hasOwnProperty.call(patch, 'avatarUrl')) {
      throw new AppError(ErrorCode.PARAM_ERROR, '至少提交昵称、Bio 或头像');
    }

    let result: CommunityProfilePatchResult;
    try {
      result = await this.profiles.patch(userId, patch);
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

    if (result.replacedAvatarUrl && result.replacedAvatarUrl !== result.profile.avatarUrl) {
      await this.removeAvatarIfUnpublished(userId, result.replacedAvatarUrl);
    }
    return toCurrentCommunityProfile(identity, result.profile);
  }

  clearAvatar(userId: number) {
    return this.updateProfile(userId, { clearAvatar: true });
  }

  cleanupOrphanAvatars(before: Date) {
    return this.avatars.cleanupOrphans(before);
  }

  private async removeAvatarIfUnpublished(userId: number, avatarUrl: string) {
    try {
      if (await this.profiles.isAvatarPublished(avatarUrl)) return;
      await this.avatars.removeAvatar(avatarUrl);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      Logger.warn('CommunityAvatar', `旧头像引用确认或清理失败 userId=${userId}`, detail);
    }
  }
}
