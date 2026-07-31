/**
 * [INPUT]: 依赖 Community 公共资料与存储 DTO，不依赖具体数据库、图片库或文件系统
 * [OUTPUT]: 对外提供 CommunityProfileReader、资料仓储与头像存储三个边界端口
 * [POS]: modules/community/domain 的依赖倒置契约，供社交消费者批量投影作者并隔离资料副作用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfile, StoredCommunityProfile } from './community';

export interface CommunityProfileReader {
  getMany(userIds: readonly number[]): Promise<Map<number, CommunityProfile>>;
}

export interface CommunityProfileRepository {
  getMany(userIds: readonly number[]): Promise<Map<number, StoredCommunityProfile>>;
  save(profile: StoredCommunityProfile): Promise<void>;
  isAvatarPublished(publicPath: string): Promise<boolean>;
}

export interface CommunityAvatarStorage {
  storeAvatar(userId: number, file: File): Promise<string>;
  removeAvatar(avatarUrl: string): Promise<void>;
}
