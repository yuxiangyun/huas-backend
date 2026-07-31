/**
 * [INPUT]: 依赖 Notifications HTTP adapter、查询键与 TanStack Query
 * [OUTPUT]: 对外提供通知分页/增量、未读/总量摘要与逐条已读 hooks
 * [POS]: entities/notifications 的缓存编排层，摘要轮询为上层暴露撤销校准信号且不轮询 offset 列表
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

export function useNotificationsInfiniteQuery(pageSize = 30, enabled = true) {
  return useInfiniteQuery({
    initialPageParam: 1,
    queryKey: notificationQueryKeys.list(pageSize),
    queryFn: ({ pageParam, signal }) => getNotifications(pageParam, pageSize, { signal }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled,
  });
}

export function useNotificationChangesQuery(afterNotificationId: number | null) {
  return useQuery({
    queryKey: notificationQueryKeys.changes(afterNotificationId ?? 0),
    queryFn: ({ signal }) => getNotificationChanges(afterNotificationId ?? 0, 100, { signal }),
    enabled: afterNotificationId !== null,
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
    },
  });
}
