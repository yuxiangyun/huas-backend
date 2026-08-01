/**
 * [INPUT]: 依赖共享 apiRequest 与 SocialUnreadSummary DTO
 * [OUTPUT]: 对外提供单请求 getSocialUnreadSummary
 * [POS]: entities/social 的 HTTP adapter，集中维护 `/api/social/unread-summary` 协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { apiRequest } from '@/shared/api/http-client';
import type { SocialUnreadSummary } from '@/entities/social/model/social-summary-types';

export function getSocialUnreadSummary(options?: { signal?: AbortSignal }) {
  return apiRequest<SocialUnreadSummary>('/api/social/unread-summary', {}, { signal: options?.signal });
}
