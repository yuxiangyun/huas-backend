/**
 * [INPUT]: 依赖 admin API、稳定 query keys、后台会话与 TanStack Query 缓存原语
 * [OUTPUT]: 提供后台资源查询/变更 hooks，包含课表来源策略查询与权威快照写回
 * [POS]: entities/admin 的服务器状态编排层，页面只组合查询结果和用户动作
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminSession } from '@/features/admin-treehole/model/admin-session';
import {
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  deleteAdminDiscoverPost,
  deleteAdminTreeholeComment,
  deleteAdminTreeholePost,
  getAdminAnnouncements,
  getAdminAnalyticsOverview,
  getAdminComplianceStatus,
  getAdminDashboard,
  getAdminScheduleSourcePolicy,
  getAdminTerminalLogs,
  getAdminTreeholeComments,
  getAdminTreeholePosts,
  updateAdminAnnouncement,
  updateAdminComplianceStatus,
  updateAdminScheduleSourcePolicy,
} from '@/entities/admin/api/admin-api';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import type {
  AdminAnnouncementPayload,
  AdminAnnouncementUpdatePayload,
} from '@/entities/admin/model/admin-types';

export function useAdminAnalyticsQuery(session: AdminSession | null, days: 7 | 30 | 90) {
  return useQuery({
    queryKey: adminQueryKeys.analytics(days),
    queryFn: ({ signal }) => getAdminAnalyticsOverview(days, { signal }),
    enabled: session !== null,
  });
}

export function useAdminComplianceQuery(session: AdminSession | null) {
  return useQuery({
    queryKey: adminQueryKeys.compliance(),
    queryFn: ({ signal }) => getAdminComplianceStatus({ signal }),
    enabled: session !== null,
  });
}

export function useUpdateAdminComplianceMutation(session: AdminSession | null) {
  return useMutation({
    mutationFn: (payload: Parameters<typeof updateAdminComplianceStatus>[0]) =>
      updateAdminComplianceStatus(payload),
  });
}

export function useAdminScheduleSourcePolicyQuery(session: AdminSession | null) {
  return useQuery({
    queryKey: adminQueryKeys.scheduleSourcePolicy(),
    queryFn: ({ signal }) => getAdminScheduleSourcePolicy({ signal }),
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

export function useAdminDashboardQuery(
  session: AdminSession | null,
  params: { page?: number; search?: string; major?: string; grade?: string }
) {
  return useQuery({
    queryKey: adminQueryKeys.dashboard(params),
    queryFn: ({ signal }) => getAdminDashboard(params, { signal }),
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
    enabled: session !== null,
    select: (data) => data.discover,
  });
}

export function useAdminAnnouncementsQuery(session: AdminSession | null) {
  return useQuery({
    queryKey: adminQueryKeys.announcementsAll(),
    queryFn: ({ signal }) => getAdminAnnouncements({ signal }),
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
    enabled: session !== null,
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
    enabled: session !== null && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval,
  });
}
