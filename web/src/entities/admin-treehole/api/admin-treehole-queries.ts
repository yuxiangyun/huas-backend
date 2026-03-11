import { useMutation, useQuery } from '@tanstack/react-query';
import {
  deleteAdminTreeholeComment,
  deleteAdminTreeholePost,
  getAdminTreeholeComments,
  getAdminTreeholePosts,
  getAdminTerminalLogs,
} from '@/entities/admin-treehole/api/admin-treehole-api';
import { adminTreeholeQueryKeys } from '@/entities/admin-treehole/model/admin-treehole-query-keys';
import type { AdminBasicSession } from '@/features/admin-treehole/model/admin-session';

export function useAdminTreeholePostsQuery(
  session: AdminBasicSession | null,
  params: { keyword?: string; page?: number; pageSize?: number }
) {
  return useQuery({
    queryKey: adminTreeholeQueryKeys.posts(params),
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
    queryKey: adminTreeholeQueryKeys.comments(postId ?? 0, params),
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
  params: { limit?: number; keyword?: string }
) {
  return useQuery({
    queryKey: adminTreeholeQueryKeys.logs(params),
    queryFn: ({ signal }) => getAdminTerminalLogs(session!, params, { signal }),
    enabled: session !== null,
    refetchInterval: 10_000,
  });
}
