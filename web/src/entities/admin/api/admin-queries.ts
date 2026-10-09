/**
 * [INPUT]: 依赖 admin API、稳定 query keys、后台会话、共享后台/轮询时间策略与 TanStack Query 缓存原语
 * [OUTPUT]: 提供 15 秒账户/内容/运营快照、运行轮询与管理变更后的资源缓存失效
 * [POS]: entities/admin 的服务器状态编排层，页面只组合查询结果和用户动作，高水位键不继承普通后台保留期
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminSession } from '@/features/admin-treehole/model/admin-session';
import {
  getAdminOverview,
  getAdminUsers,
  getAdminDiscoverPosts,
  getAdminDiscoverPost,
  getAdminDiscoverComments,
  deleteAdminDiscoverComment,
  getAdminTreeholePost,
  getAdminEarlyRisingOverview,
  getAdminEarlyRisingLeaderboard,
  getAdminRuntime,
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  deleteAdminDiscoverPost,
  deleteAdminTreeholeComment,
  deleteAdminTreeholePost,
  getAdminAnnouncements,
  getAdminAnalyticsOverview,
  getAdminDashboard,
  getAdminEarlyRisingSettings,
  getAdminIndexPopupSettings,
  getAdminMessagingConversationChanges,
  getAdminMessagingConversations,
  getAdminMessagingMessages,
  getAdminScheduleSourcePolicy,
  getAdminTerminalLogs,
  getAdminTreeholeComments,
  getAdminTreeholePosts,
  updateAdminAnnouncement,
  updateAdminEarlyRisingSettings,
  updateAdminIndexPopupSettings,
  updateAdminScheduleSourcePolicy,
} from '@/entities/admin/api/admin-api';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import type {
  AdminUsersParams,
  AdminDiscoverPostsParams,
  AdminEarlyRisingPeriod,
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
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.logsAll() });
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
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.logsAll() });
    },
  });
}

export function useAdminEarlyRisingSettingsQuery(session: AdminSession | null) {
  return useQuery({
    queryKey: adminQueryKeys.earlyRisingSettings(),
    queryFn: ({ signal }) => getAdminEarlyRisingSettings({ signal }),
    ...QUERY_CACHE_POLICY.admin,
    enabled: session !== null,
  });
}

export function useUpdateAdminEarlyRisingSettingsMutation(_session: AdminSession | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAdminEarlyRisingSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(adminQueryKeys.earlyRisingSettings(), settings);
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.logsAll() });
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

export function useCreateAdminAnnouncementMutation(_session: AdminSession | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdminAnnouncementPayload) => createAdminAnnouncement(payload),
    onSuccess: () => invalidateAnnouncementResources(queryClient),
  });
}

export function useUpdateAdminAnnouncementMutation(_session: AdminSession | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AdminAnnouncementUpdatePayload }) =>
      updateAdminAnnouncement(id, payload),
    onSuccess: () => invalidateAnnouncementResources(queryClient),
  });
}

export function useDeleteAdminAnnouncementMutation(_session: AdminSession | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteAdminAnnouncement(id),
    onSuccess: () => invalidateAnnouncementResources(queryClient),
  });
}

export function useDeleteAdminDiscoverPostMutation(_session: AdminSession | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => deleteAdminDiscoverPost(postId),
    onSuccess: ({ id }) => {
      queryClient.removeQueries({ queryKey: adminQueryKeys.discoverPost(id) });
      queryClient.removeQueries({ queryKey: adminQueryKeys.discoverCommentsByPost(id) });
      return invalidateContentResources(queryClient, adminQueryKeys.discoverAll());
    },
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

export function useDeleteAdminTreeholePostMutation(_session: AdminSession | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => deleteAdminTreeholePost(postId),
    onSuccess: ({ id }) => {
      queryClient.removeQueries({ queryKey: adminQueryKeys.treeholePost(id) });
      queryClient.removeQueries({ queryKey: adminQueryKeys.treeholeCommentsByPost(id) });
      return invalidateContentResources(queryClient, adminQueryKeys.treeholeAll());
    },
  });
}

export function useDeleteAdminTreeholeCommentMutation(_session: AdminSession | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: { commentId: number }) => deleteAdminTreeholeComment(commentId),
    onSuccess: () => invalidateContentResources(queryClient, adminQueryKeys.treeholeAll()),
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

function invalidateAnnouncementResources(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.announcementsAll() }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.dashboardAll() }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.logsAll() }),
  ]);
}

function invalidateContentResources(queryClient: ReturnType<typeof useQueryClient>, contentKey: readonly string[]) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: contentKey }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.overview() }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.dashboardAll() }),
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.logsAll() }),
  ]);
}

export function useAdminOverviewQuery(session: AdminSession | null) {
  return useQuery({
    queryKey: adminQueryKeys.overview(), queryFn: ({ signal }) => getAdminOverview({ signal }),
    ...QUERY_CACHE_POLICY.admin, enabled: session !== null,
  });
}

export function useAdminUsersQuery(session: AdminSession | null, params: AdminUsersParams) {
  return useQuery({
    queryKey: adminQueryKeys.users(params), queryFn: ({ signal }) => getAdminUsers(params, { signal }),
    ...QUERY_CACHE_POLICY.admin, enabled: session !== null,
  });
}

export function useAdminDiscoverPostsQuery(session: AdminSession | null, params: AdminDiscoverPostsParams) {
  return useQuery({
    queryKey: adminQueryKeys.discoverPosts(params), queryFn: ({ signal }) => getAdminDiscoverPosts(params, { signal }),
    ...QUERY_CACHE_POLICY.admin, enabled: session !== null,
  });
}

export function useAdminDiscoverPostQuery(session: AdminSession | null, postId: number | null) {
  return useQuery({
    queryKey: adminQueryKeys.discoverPost(postId ?? 0), queryFn: ({ signal }) => getAdminDiscoverPost(postId!, { signal }),
    ...QUERY_CACHE_POLICY.admin, enabled: session !== null && postId !== null,
  });
}

export function useAdminDiscoverCommentsQuery(session: AdminSession | null, postId: number | null, params: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: adminQueryKeys.discoverComments(postId ?? 0, params), queryFn: ({ signal }) => getAdminDiscoverComments(postId!, params, { signal }),
    ...QUERY_CACHE_POLICY.admin, enabled: session !== null && postId !== null,
  });
}

export function useDeleteAdminDiscoverCommentMutation(_session: AdminSession | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: { commentId: number }) => deleteAdminDiscoverComment(commentId),
    onSuccess: () => invalidateContentResources(queryClient, adminQueryKeys.discoverAll()),
  });
}

export function useAdminTreeholePostQuery(session: AdminSession | null, postId: number | null) {
  return useQuery({
    queryKey: adminQueryKeys.treeholePost(postId ?? 0), queryFn: ({ signal }) => getAdminTreeholePost(postId!, { signal }),
    ...QUERY_CACHE_POLICY.admin, enabled: session !== null && postId !== null,
  });
}

export function useAdminEarlyRisingOverviewQuery(session: AdminSession | null, days: 7 | 30 | 90) {
  return useQuery({
    queryKey: adminQueryKeys.earlyRisingOverview(days), queryFn: ({ signal }) => getAdminEarlyRisingOverview(days, { signal }),
    ...QUERY_CACHE_POLICY.admin, enabled: session !== null,
  });
}

export function useAdminEarlyRisingLeaderboardQuery(session: AdminSession | null, period: AdminEarlyRisingPeriod) {
  return useQuery({
    queryKey: adminQueryKeys.earlyRisingLeaderboard(period), queryFn: ({ signal }) => getAdminEarlyRisingLeaderboard(period, { signal }),
    ...QUERY_CACHE_POLICY.admin, enabled: session !== null,
  });
}

export function useAdminRuntimeQuery(session: AdminSession | null, options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: adminQueryKeys.runtime(), queryFn: ({ signal }) => getAdminRuntime({ signal }),
    ...QUERY_CACHE_POLICY.admin, enabled: session !== null, refetchInterval: options?.refetchInterval,
    refetchIntervalInBackground: false,
  });
}
