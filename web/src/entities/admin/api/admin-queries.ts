import { useMutation, useQuery } from '@tanstack/react-query';
import type { AdminBasicSession } from '@/features/admin-treehole/model/admin-session';
import {
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  deleteAdminDiscoverPost,
  deleteAdminTreeholeComment,
  deleteAdminTreeholePost,
  getAdminAnnouncements,
  getAdminDashboard,
  getAdminTerminalLogs,
  getAdminTreeholeComments,
  getAdminTreeholePosts,
  updateAdminAnnouncement,
} from '@/entities/admin/api/admin-api';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import type {
  AdminAnnouncementPayload,
  AdminAnnouncementUpdatePayload,
} from '@/entities/admin/model/admin-types';

export function useAdminDashboardQuery(
  session: AdminBasicSession | null,
  params: { page?: number; search?: string; major?: string; grade?: string }
) {
  return useQuery({
    queryKey: adminQueryKeys.dashboard(params),
    queryFn: ({ signal }) => getAdminDashboard(session!, params, { signal }),
    enabled: session !== null,
  });
}

export function useAdminDiscoverQuery(
  session: AdminBasicSession | null,
  params: { page?: number; search?: string; major?: string; grade?: string }
) {
  return useQuery({
    queryKey: adminQueryKeys.discover(params),
    queryFn: ({ signal }) => getAdminDashboard(session!, params, { signal }),
    enabled: session !== null,
    select: (data) => data.discover,
  });
}

export function useAdminAnnouncementsQuery(session: AdminBasicSession | null) {
  return useQuery({
    queryKey: adminQueryKeys.announcementsAll(),
    queryFn: ({ signal }) => getAdminAnnouncements(session!, { signal }),
    enabled: session !== null,
  });
}

export function useCreateAdminAnnouncementMutation(session: AdminBasicSession | null) {
  return useMutation({
    mutationFn: (payload: AdminAnnouncementPayload) => createAdminAnnouncement(session!, payload),
  });
}

export function useUpdateAdminAnnouncementMutation(session: AdminBasicSession | null) {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AdminAnnouncementUpdatePayload }) =>
      updateAdminAnnouncement(session!, id, payload),
  });
}

export function useDeleteAdminAnnouncementMutation(session: AdminBasicSession | null) {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => deleteAdminAnnouncement(session!, id),
  });
}

export function useDeleteAdminDiscoverPostMutation(session: AdminBasicSession | null) {
  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => deleteAdminDiscoverPost(session!, postId),
  });
}

export function useAdminTreeholePostsQuery(
  session: AdminBasicSession | null,
  params: { keyword?: string; page?: number; pageSize?: number }
) {
  return useQuery({
    queryKey: adminQueryKeys.treeholePosts(params),
    queryFn: ({ signal }) => getAdminTreeholePosts(session!, params, { signal }),
    enabled: session !== null,
  });
}

export function useAdminTreeholeCommentsQuery(
  session: AdminBasicSession | null,
  postId: number | null,
  params: { page?: number; pageSize?: number }
) {
  return useQuery({
    queryKey: adminQueryKeys.treeholeComments(postId ?? 0, params),
    queryFn: ({ signal }) => getAdminTreeholeComments(session!, postId!, params, { signal }),
    enabled: session !== null && postId !== null,
  });
}

export function useDeleteAdminTreeholePostMutation(session: AdminBasicSession | null) {
  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => deleteAdminTreeholePost(session!, postId),
  });
}

export function useDeleteAdminTreeholeCommentMutation(session: AdminBasicSession | null) {
  return useMutation({
    mutationFn: ({ commentId }: { commentId: number }) => deleteAdminTreeholeComment(session!, commentId),
  });
}

export function useAdminTerminalLogsQuery(
  session: AdminBasicSession | null,
  params: { limit?: number; keyword?: string },
  options?: { refetchInterval?: number | false; enabled?: boolean }
) {
  return useQuery({
    queryKey: adminQueryKeys.logs(params),
    queryFn: ({ signal }) => getAdminTerminalLogs(session!, params, { signal }),
    enabled: session !== null && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval,
  });
}
