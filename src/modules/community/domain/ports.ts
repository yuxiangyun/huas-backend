/**
 * [INPUT]: 依赖 Community 公共资料与存储 DTO，不依赖具体数据库、图片库或文件系统
 * [OUTPUT]: 对外提供 CommunityProfileReader、字段 patch/被替换头像结果、引用查询与头像存储边界
 * [POS]: modules/community/domain 的依赖倒置契约，以窄端口隔离公共投影、并发资料写入与媒体副作用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfile, StoredCommunityProfile } from './community';

export interface CommunityProfilePatch {
  nickname?: string | null;
  avatarUrl?: string | null;
}

export interface CommunityProfilePatchResult {
  profile: StoredCommunityProfile;
  replacedAvatarUrl: string | null;
}

export interface CommunityProfileReader {
  getMany(userIds: readonly number[]): Promise<Map<number, CommunityProfile>>;
}

export interface CommunityProfileRepository {
  getMany(userIds: readonly number[]): Promise<Map<number, StoredCommunityProfile>>;
  patch(userId: number, patch: CommunityProfilePatch): Promise<CommunityProfilePatchResult>;
  isAvatarPublished(avatarUrl: string): Promise<boolean>;
}

export interface CommunityAvatarStorage {
  storeAvatar(userId: number, file: File): Promise<string>;
  removeAvatar(avatarUrl: string): Promise<void>;
}
