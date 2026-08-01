/**
 * [INPUT]: 依赖 User HTTP adapter、共享旁路缓存策略与 TanStack Query 查询/变更原语
 * [OUTPUT]: 对外提供校园资料缓存、客户端零保留的强制刷新与日历订阅 mutation hooks
 * [POS]: entities/user 的服务器状态编排层，普通资料可复用，refresh=true 只合并在途请求并把成功结果写回普通键
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getCalendarSubscriptionLink,
  getUserInfo,
} from '@/entities/user/api/user-api';
import { QUERY_CACHE_POLICY } from '@/shared/api/query-cache-policy';

export const userQueryKeys = {
  all: ['user'] as const,
  detail: (refresh = false) => [...userQueryKeys.all, 'detail', { refresh }] as const,
};

export function useUserInfoQuery(refresh = false) {
  return useQuery({
    queryKey: userQueryKeys.detail(refresh),
    queryFn: () => getUserInfo(refresh),
    ...(refresh ? QUERY_CACHE_POLICY.bypass : {}),
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
    ...QUERY_CACHE_POLICY.bypass,
  });

  queryClient.setQueryData(userQueryKeys.detail(false), data);
  return data;
}
