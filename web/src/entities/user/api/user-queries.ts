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
