/**
 * [INPUT]: 依赖共享 apiRequest 与 Community 当前资料契约
 * [OUTPUT]: 对外提供本人资料读写、头像清除与指定用户公共资料请求
 * [POS]: entities/community 的 HTTP adapter，集中维护 `/api/community` 协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { apiRequest } from '@/shared/api/http-client';
import type { CommunityProfile, CurrentCommunityProfile } from '@/entities/community/model/community-types';

interface RequestOptions {
  signal?: AbortSignal;
}

export function getCurrentCommunityProfile(options?: RequestOptions) {
  return apiRequest<CurrentCommunityProfile>('/api/community/profile', {}, { signal: options?.signal });
}

export function getCommunityUser(userId: number, options?: RequestOptions) {
  return apiRequest<CommunityProfile>(`/api/community/users/${userId}`, {}, { signal: options?.signal });
}

export function updateCommunityProfile(payload: { nickname?: string; avatar?: File }) {
  const form = new FormData();
  if (payload.nickname !== undefined) form.set('nickname', payload.nickname.trim());
  if (payload.avatar) form.set('avatar', payload.avatar);
  return apiRequest<CurrentCommunityProfile>('/api/community/profile', { method: 'PUT', body: form });
}

export function clearCommunityAvatar() {
  return apiRequest<CurrentCommunityProfile>('/api/community/profile/avatar', { method: 'DELETE' });
}
