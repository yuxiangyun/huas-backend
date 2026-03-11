import type { AdminBasicSession } from '@/features/admin-treehole/model/admin-session';
import { apiRequest } from '@/shared/api/http-client';
import type {
  AdminTreeholeCommentListResponse,
  AdminTreeholePostListResponse,
  AdminTerminalLogResponse,
} from '@/entities/admin-treehole/model/admin-treehole-types';

interface RequestOptions {
  signal?: AbortSignal;
}

function buildQueryString(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    searchParams.set(key, String(value));
  }

  const search = searchParams.toString();
  return search ? `?${search}` : '';
}

function createAdminHeaders(session: AdminBasicSession) {
  return {
    Authorization: session.authorization,
  };
}

export async function getAdminTreeholePosts(
  session: AdminBasicSession,
  params: { keyword?: string; page?: number; pageSize?: number },
  options?: RequestOptions
) {
  return apiRequest<AdminTreeholePostListResponse>(
    `/api/admin/treehole/posts${buildQueryString({
      keyword: params.keyword,
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {
      headers: createAdminHeaders(session),
    },
    { auth: false, signal: options?.signal }
  );
}

export async function getAdminTreeholeComments(
  session: AdminBasicSession,
  postId: number,
  params: { page?: number; pageSize?: number },
  options?: RequestOptions
) {
  return apiRequest<AdminTreeholeCommentListResponse>(
    `/api/admin/treehole/posts/${postId}/comments${buildQueryString({
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {
      headers: createAdminHeaders(session),
    },
    { auth: false, signal: options?.signal }
  );
}

export async function deleteAdminTreeholePost(session: AdminBasicSession, postId: number) {
  return apiRequest<{ id: number }>(
    `/api/admin/treehole/posts/${postId}`,
    {
      method: 'DELETE',
      headers: createAdminHeaders(session),
    },
    { auth: false }
  );
}

export async function deleteAdminTreeholeComment(session: AdminBasicSession, commentId: number) {
  return apiRequest<{ id: number; postId: number }>(
    `/api/admin/treehole/comments/${commentId}`,
    {
      method: 'DELETE',
      headers: createAdminHeaders(session),
    },
    { auth: false }
  );
}

export async function getAdminTerminalLogs(
  session: AdminBasicSession,
  params: { limit?: number; keyword?: string },
  options?: RequestOptions
) {
  return apiRequest<AdminTerminalLogResponse>(
    `/api/admin/logs${buildQueryString({
      limit: params.limit,
      keyword: params.keyword,
    })}`,
    {
      headers: createAdminHeaders(session),
    },
    { auth: false, signal: options?.signal }
  );
}
