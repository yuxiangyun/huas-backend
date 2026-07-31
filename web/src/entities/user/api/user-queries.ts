/**
 * [INPUT]: 依赖 User HTTP adapter 与 TanStack Query 查询/变更原语
 * [OUTPUT]: 对外提供校园资料缓存、强制刷新与日历订阅 mutation hooks
 * [POS]: entities/user 的服务器状态编排层，供个人页和登录后刷新流程消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getCalendarSubscriptionLink,
  getUserInfo,
} from '@/entities/user/api/user-api';

export const userQueryKeys = {
  all: ['user'] as const,
  detail: (refresh = false) => [...userQueryKeys.all, 'detail', { refresh }] as const,
};

export function useUserInfoQuery(refresh = false) {
  return useQuery({
    queryKey: userQueryKeys.detail(refresh),
    queryFn: () => getUserInfo(refresh),
  });
}

export function useCalendarSubscriptionLinkMutation() {
  return useMutation({
    mutationFn: getCalendarSubscriptionLink,
  });
}

export async function refreshUserInfo(queryClient: QueryClient) {
  const data = await queryClient.fetchQuery({
    queryKey: userQueryKeys.detail(true),
    queryFn: () => getUserInfo(true),
  });

  queryClient.setQueryData(userQueryKeys.detail(false), data);
  return data;
}
