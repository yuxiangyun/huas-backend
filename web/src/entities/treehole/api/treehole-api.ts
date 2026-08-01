/**
 * [INPUT]: 依赖共享 apiRequest 与 Treehole 类型契约
 * [OUTPUT]: 对外提供公开/本人/指定用户 Treehole 图文帖子、multipart 发布、评论、点赞与删除请求
 * [POS]: entities/treehole 的传输边界，集中维护 /api/treehole 协议、FormData 与查询参数序列化
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { apiRequest } from '@/shared/api/http-client';
import type {
  TreeholeComment,
  TreeholeCommentListResponse,
  TreeholeListResponse,
  TreeholeMeta,
  TreeholePost,
  TreeholeLikeResult,
} from '@/entities/treehole/model/treehole-types';

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

export interface TreeholeListParams {
  page?: number;
  pageSize?: number;
}

export interface TreeholeCommentListParams {
  page?: number;
  pageSize?: number;
}

export async function getTreeholeMeta(options?: RequestOptions) {
  return apiRequest<TreeholeMeta>('/api/treehole/meta', {}, { signal: options?.signal });
}

export async function getTreeholePosts(params: TreeholeListParams, options?: RequestOptions) {
  return apiRequest<TreeholeListResponse>(
    `/api/treehole/posts${buildQueryString({
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {},
    { signal: options?.signal }
  );
}

export async function getMyTreeholePosts(params: TreeholeListParams, options?: RequestOptions) {
  return apiRequest<TreeholeListResponse>(
    `/api/treehole/posts/me${buildQueryString({
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {},
    { signal: options?.signal }
  );
}

export async function getUserTreeholePosts(
  userId: number,
  params: TreeholeListParams,
  options?: RequestOptions
) {
  return apiRequest<TreeholeListResponse>(
    `/api/treehole/users/${userId}/posts${buildQueryString({
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {},
    { signal: options?.signal }
  );
}

export async function getTreeholePostDetail(postId: number, options?: RequestOptions) {
  return apiRequest<TreeholePost>(
    `/api/treehole/posts/${postId}`,
    {},
    { signal: options?.signal }
  );
}

export async function createTreeholePost(payload: { content: string; images: readonly File[] }) {
  const formData = new FormData();
  formData.set('content', payload.content.trim());
  payload.images.forEach((image) => formData.append('images', image));

  return apiRequest<TreeholePost>('/api/treehole/posts', {
    method: 'POST',
    body: formData,
  });
}

export async function likeTreeholePost(postId: number) {
  return apiRequest<TreeholeLikeResult>(`/api/treehole/posts/${postId}/like`, {
    method: 'PUT',
  });
}

export async function unlikeTreeholePost(postId: number) {
  return apiRequest<TreeholeLikeResult>(`/api/treehole/posts/${postId}/like`, {
    method: 'DELETE',
  });
}

export async function deleteTreeholePost(postId: number) {
  return apiRequest<{ id: number }>(`/api/treehole/posts/${postId}`, {
    method: 'DELETE',
  });
}

export async function getTreeholeComments(
  postId: number,
  params: TreeholeCommentListParams,
  options?: RequestOptions
) {
  return apiRequest<TreeholeCommentListResponse>(
    `/api/treehole/posts/${postId}/comments${buildQueryString({
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {},
    { signal: options?.signal }
  );
}

export async function createTreeholeComment(postId: number, payload: { content: string; parentCommentId?: number | null }) {
  return apiRequest<TreeholeComment>(`/api/treehole/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      content: payload.content.trim(),
      parentCommentId: payload.parentCommentId ?? null,
    }),
  });
}

export async function deleteTreeholeComment(commentId: number) {
  return apiRequest<{ id: number; postId: number }>(`/api/treehole/comments/${commentId}`, {
    method: 'DELETE',
  });
}
