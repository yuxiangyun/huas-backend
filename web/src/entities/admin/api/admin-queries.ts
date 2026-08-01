/**
 * [INPUT]: 依赖 admin API、稳定 query keys、后台会话、共享后台/轮询时间策略与 TanStack Query 缓存原语
 * [OUTPUT]: 提供 15 秒后台快照查询/变更 hooks，包含短命私信游标、课表策略与首页弹窗三态设置写回
 * [POS]: entities/admin 的服务器状态编排层，页面只组合查询结果和用户动作，高水位键不继承普通后台保留期
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminSession } from '@/features/admin-treehole/model/admin-session';
import {
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  deleteAdminDiscoverPost,
  deleteAdminTreeholeComment,
  deleteAdminTreeholePost,
  getAdminAnnouncements,
  getAdminAnalyticsOverview,
  getAdminDashboard,
  getAdminIndexPopupSettings,
  getAdminMessagingConversationChanges,
  getAdminMessagingConversations,
  getAdminMessagingMessages,
  getAdminScheduleSourcePolicy,
  getAdminTerminalLogs,
  getAdminTreeholeComments,
  getAdminTreeholePosts,
  updateAdminAnnouncement,
  updateAdminIndexPopupSettings,
  updateAdminScheduleSourcePolicy,
} from '@/entities/admin/api/admin-api';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import type {
  AdminAnnouncementPayload,
  AdminAnnouncementUpdatePayload,
} from '@/entities/admin/model/admin-types';
import { liveQueryCachePolicy, QUERY_CACHE_POLICY } from '@/shared/api/query-cache-policy';

export function useAdminAnalyticsQuery(session: AdminSession | null, days: 7 | 30 | 90) {
  return useQuery({
    queryKey: adminQueryKeys.analytics(days),
    queryFn: ({ signal }) => getAdminAnalyticsOverview(days, { signal }),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null,
  });
}

export function useAdminScheduleSourcePolicyQuery(session: AdminSession | null) {
  return useQuery({
    queryKey: adminQueryKeys.scheduleSourcePolicy(),
    queryFn: ({ signal }) => getAdminScheduleSourcePolicy({ signal }),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null,
  });
}

export function useUpdateAdminScheduleSourcePolicyMutation(_session: AdminSession | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAdminScheduleSourcePolicy,
    onSuccess: (policy) => {
      queryClient.setQueryData(adminQueryKeys.scheduleSourcePolicy(), policy);
    },
  });
}

export function useAdminIndexPopupSettingsQuery(session: AdminSession | null) {
  return useQuery({
    queryKey: adminQueryKeys.indexPopupSettings(),
    queryFn: ({ signal }) => getAdminIndexPopupSettings({ signal }),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null,
  });
}

export function useUpdateAdminIndexPopupSettingsMutation(_session: AdminSession | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAdminIndexPopupSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(adminQueryKeys.indexPopupSettings(), settings);
    },
  });
}

export function useAdminDashboardQuery(
  session: AdminSession | null,
  params: { page?: number; search?: string; major?: string; grade?: string }
) {
  return useQuery({
    queryKey: adminQueryKeys.dashboard(params),
    queryFn: ({ signal }) => getAdminDashboard(params, { signal }),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null,
  });
}

export function useAdminDiscoverQuery(
  session: AdminSession | null,
  params: { page?: number; search?: string; major?: string; grade?: string }
) {
  return useQuery({
    queryKey: adminQueryKeys.discover(params),
    queryFn: ({ signal }) => getAdminDashboard(params, { signal }),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null,
    select: (data) => data.discover,
  });
}

export function useAdminAnnouncementsQuery(session: AdminSession | null) {
  return useQuery({
    queryKey: adminQueryKeys.announcementsAll(),
    queryFn: ({ signal }) => getAdminAnnouncements({ signal }),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null,
  });
}

export function useCreateAdminAnnouncementMutation(session: AdminSession | null) {
  return useMutation({
    mutationFn: (payload: AdminAnnouncementPayload) => createAdminAnnouncement(payload),
  });
}

export function useUpdateAdminAnnouncementMutation(session: AdminSession | null) {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AdminAnnouncementUpdatePayload }) =>
      updateAdminAnnouncement(id, payload),
  });
}

export function useDeleteAdminAnnouncementMutation(session: AdminSession | null) {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteAdminAnnouncement(id),
  });
}

export function useDeleteAdminDiscoverPostMutation(session: AdminSession | null) {
  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => deleteAdminDiscoverPost(postId),
  });
}

export function useAdminTreeholePostsQuery(
  session: AdminSession | null,
  params: { keyword?: string; page?: number; pageSize?: number }
) {
  return useQuery({
    queryKey: adminQueryKeys.treeholePosts(params),
    queryFn: ({ signal }) => getAdminTreeholePosts(params, { signal }),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null,
  });
}

export function useAdminMessagingConversationsQuery(
  session: AdminSession | null,
  params: { page?: number; pageSize?: number }
) {
  return useQuery({
    queryKey: adminQueryKeys.messagingConversations(params),
    queryFn: ({ signal }) => getAdminMessagingConversations(params, { signal }),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null,
  });
}

export function useAdminMessagingConversationChangesQuery(
  session: AdminSession | null,
  afterMessageId: number | null
) {
  return useQuery({
    queryKey: adminQueryKeys.messagingConversationChanges(afterMessageId ?? 0),
    queryFn: ({ signal }) => getAdminMessagingConversationChanges(afterMessageId ?? 0, 100, { signal }),
    ...liveQueryCachePolicy(10_000),
    enabled: session !== null && afterMessageId !== null,
  });
}

export function useAdminMessagingMessagesInfiniteQuery(
  session: AdminSession | null,
  conversationId: number | null
) {
  return useInfiniteQuery({
    initialPageParam: null as number | null,
    queryKey: adminQueryKeys.messagingMessages(conversationId ?? 0),
    queryFn: ({ pageParam, signal }) => getAdminMessagingMessages(
      conversationId!,
      pageParam === null ? { limit: 50 } : { beforeMessageId: pageParam, limit: 50 },
      { signal }
    ),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.beforeMessageId ?? undefined : undefined),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null && conversationId !== null,
  });
}

export function useAdminMessagingMessageChangesQuery(
  session: AdminSession | null,
  conversationId: number | null,
  afterMessageId: number | null
) {
  return useQuery({
    queryKey: adminQueryKeys.messagingMessageChanges(conversationId ?? 0, afterMessageId ?? 0),
    queryFn: ({ signal }) => getAdminMessagingMessages(
      conversationId!,
      { afterMessageId: afterMessageId!, limit: 100 },
      { signal }
    ),
    ...liveQueryCachePolicy(5_000),
    enabled: session !== null && conversationId !== null && afterMessageId !== null,
  });
}

export function useAdminTreeholeCommentsQuery(
  session: AdminSession | null,
  postId: number | null,
  params: { page?: number; pageSize?: number }
) {
  return useQuery({
    queryKey: adminQueryKeys.treeholeComments(postId ?? 0, params),
    queryFn: ({ signal }) => getAdminTreeholeComments(postId!, params, { signal }),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null && postId !== null,
  });
}

export function useDeleteAdminTreeholePostMutation(session: AdminSession | null) {
  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => deleteAdminTreeholePost(postId),
  });
}

export function useDeleteAdminTreeholeCommentMutation(session: AdminSession | null) {
  return useMutation({
    mutationFn: ({ commentId }: { commentId: number }) => deleteAdminTreeholeComment(commentId),
  });
}

export function useAdminTerminalLogsQuery(
  session: AdminSession | null,
  params: { limit?: number; keyword?: string },
  options?: { refetchInterval?: number | false; enabled?: boolean }
) {
  return useQuery({
    queryKey: adminQueryKeys.logs(params),
    queryFn: ({ signal }) => getAdminTerminalLogs(params, { signal }),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval,
  });
}
