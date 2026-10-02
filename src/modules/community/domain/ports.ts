/**
 * [INPUT]: 依赖 Community 作者/详细公共资料与存储 DTO，不依赖具体数据库、图片库或文件系统
 * [OUTPUT]: 对外提供三字段作者 reader、含 Bio 详细 reader、字段 patch/头像引用与受保护候选头像句柄
 * [POS]: modules/community/domain 的依赖倒置契约，隔离作者 DTO 并明确头像候选从创建至发布/补偿结束的保护期限
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type {
  CommunityProfile,
  DetailedCommunityProfile,
  StoredCommunityProfile,
} from './community';

export interface CommunityProfilePatch {
  nickname?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
}

export interface CommunityProfilePatchResult {
  profile: StoredCommunityProfile;
  replacedAvatarUrl: string | null;
}

export interface CommunityProfileReader {
  getMany(userIds: readonly number[]): Promise<Map<number, CommunityProfile>>;
}

export interface CommunityDetailedProfileReader {
  getManyDetailed(userIds: readonly number[]): Promise<Map<number, DetailedCommunityProfile>>;
}

export interface CommunityProfileRepository {
  getMany(userIds: readonly number[]): Promise<Map<number, StoredCommunityProfile>>;
  patch(userId: number, patch: CommunityProfilePatch): Promise<CommunityProfilePatchResult>;
  isAvatarPublished(avatarUrl: string): Promise<boolean>;
  listPublishedAvatarUrls(): Promise<string[]>;
}

export interface CommunityAvatarCandidate {
  avatarUrl: string;
  /** 发布或补偿结束后解除回收保护；同步、幂等且不抛错。 */
  release(): void;
}

export interface CommunityAvatarStorage {
  storeAvatar(userId: number, file: File): Promise<CommunityAvatarCandidate>;
  removeAvatar(avatarUrl: string): Promise<void>;
  cleanupOrphans(before: Date): Promise<number>;
}
