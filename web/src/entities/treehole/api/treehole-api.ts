import { apiRequest } from '@/shared/api/http-client';
import type {
  TreeholeComment,
  TreeholeCommentListResponse,
  TreeholeListResponse,
  TreeholeMeta,
  TreeholePost,
} from '@/entities/treehole/model/treehole-types';

function buildQueryString(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    searchParams.set(key, String(value));
  }

  const search = searchParams.toString();
  return search ? `?${search}` : '';
}

export interface TreeholeListParams {
  page?: number;
  pageSize?: number;
}

export interface TreeholeCommentListParams {
  page?: number;
  pageSize?: number;
}

export async function getTreeholeMeta() {
  return apiRequest<TreeholeMeta>('/api/treehole/meta');
}

export async function getTreeholePosts(params: TreeholeListParams) {
  return apiRequest<TreeholeListResponse>(
    `/api/treehole/posts${buildQueryString({
      page: params.page,
      pageSize: params.pageSize,
    })}`
  );
}

export async function getMyTreeholePosts(params: TreeholeListParams) {
  return apiRequest<TreeholeListResponse>(
    `/api/treehole/posts/me${buildQueryString({
      page: params.page,
      pageSize: params.pageSize,
    })}`
  );
}

export async function getTreeholePostDetail(postId: number) {
  return apiRequest<TreeholePost>(`/api/treehole/posts/${postId}`);
}

export async function createTreeholePost(payload: { content: string }) {
  return apiRequest<TreeholePost>('/api/treehole/posts', {
    method: 'POST',
    body: JSON.stringify({ content: payload.content.trim() }),
  });
}

export async function likeTreeholePost(postId: number) {
  return apiRequest<TreeholePost>(`/api/treehole/posts/${postId}/like`, {
    method: 'PUT',
  });
}

export async function unlikeTreeholePost(postId: number) {
  return apiRequest<TreeholePost>(`/api/treehole/posts/${postId}/like`, {
    method: 'DELETE',
  });
}

export async function deleteTreeholePost(postId: number) {
  return apiRequest<{ id: number }>(`/api/treehole/posts/${postId}`, {
    method: 'DELETE',
  });
}

export async function getTreeholeComments(postId: number, params: TreeholeCommentListParams) {
  return apiRequest<TreeholeCommentListResponse>(
    `/api/treehole/posts/${postId}/comments${buildQueryString({
      page: params.page,
      pageSize: params.pageSize,
    })}`
  );
}

export async function createTreeholeComment(postId: number, payload: { content: string }) {
  return apiRequest<TreeholeComment>(`/api/treehole/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content: payload.content.trim() }),
  });
}

export async function deleteTreeholeComment(commentId: number) {
  return apiRequest<{ id: number; postId: number }>(`/api/treehole/comments/${commentId}`, {
    method: 'DELETE',
  });
}
