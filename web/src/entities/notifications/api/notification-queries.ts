/**
 * [INPUT]: 依赖 Notifications HTTP adapter、领域/Social 摘要查询键与 TanStack Query
 * [OUTPUT]: 对外提供通知分页/增量、兼容未读摘要与逐条已读 hooks，写后同步失效聚合摘要
 * [POS]: entities/notifications 的缓存编排层；常规导航摘要由 Social 壳拥有，领域摘要 hook 仅保留兼容能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationChanges,
  getNotifications,
  getNotificationUnreadCount,
  markNotificationRead,
} from '@/entities/notifications/api/notification-api';
import { notificationQueryKeys } from '@/entities/notifications/model/notification-query-keys';
import { socialSummaryQueryKeys } from '@/entities/social/model/social-summary-query-keys';

export function useNotificationsInfiniteQuery(pageSize = 30, enabled = true) {
  return useInfiniteQuery({
    initialPageParam: 1,
    queryKey: notificationQueryKeys.list(pageSize),
    queryFn: ({ pageParam, signal }) => getNotifications(pageParam, pageSize, { signal }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled,
  });
}

export function useNotificationChangesQuery(afterNotificationId: number | null, enabled = true) {
  return useQuery({
    queryKey: notificationQueryKeys.changes(afterNotificationId ?? 0),
    queryFn: ({ signal }) => getNotificationChanges(afterNotificationId ?? 0, 100, { signal }),
    enabled: enabled && afterNotificationId !== null,
    refetchInterval: 15_000,
    staleTime: 0,
  });
}

export function useNotificationUnreadCountQuery() {
  return useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: ({ signal }) => getNotificationUnreadCount({ signal }),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ notificationId }: { notificationId: number }) => markNotificationRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
      queryClient.invalidateQueries({ queryKey: socialSummaryQueryKeys.unread() });
    },
  });
}
