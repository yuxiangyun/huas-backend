/**
 * [INPUT]: 依赖统一 apiRequest 与校园用户/日历订阅类型
 * [OUTPUT]: 对外提供校园资料读取和日历订阅链接请求
 * [POS]: entities/user 的 HTTP adapter，不暴露 Community 社交资料协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { apiRequest } from '@/shared/api/http-client';
import type {
  CalendarSubscriptionLink,
  UserProfile,
} from '@/entities/user/model/user-types';

export async function getUserInfo(refresh = false) {
  const suffix = refresh ? '?refresh=true' : '';
  return apiRequest<UserProfile>(`/api/user${suffix}`);
}

export async function getCalendarSubscriptionLink() {
  return apiRequest<CalendarSubscriptionLink>('/api/calendar/link');
}
