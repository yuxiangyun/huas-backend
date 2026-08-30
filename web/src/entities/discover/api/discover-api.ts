/**
 * [INPUT]: 依赖共享 apiRequest 与 Discover 稳定 DTO
 * [OUTPUT]: 对外提供公开/本人/指定用户帖子、评论、创建删除及幂等点赞请求
 * [POS]: entities/discover 的 HTTP adapter，集中维护 `/api/discover` 图文内容协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { apiRequest } from '@/shared/api/http-client';
import type {
  DiscoverComment,
  DiscoverCommentListResponse,
  DiscoverListResponse,
  DiscoverLikeResult,
  DiscoverMeta,
  DiscoverPost,
  DiscoverSort,
} from '@/entities/discover/model/discover-types';

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

export interface DiscoverListParams {
  sort?: DiscoverSort;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface DiscoverMyListParams {
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface DiscoverCommentListParams {
  page?: number;
  pageSize?: number;
}

export interface CreateDiscoverPostPayload {
  category: string;
  title: string;
  storeName?: string;
  priceText?: string;
  content: string;
  tags: string[];
  images: File[];
}

export async function getDiscoverMeta(options?: RequestOptions) {
  return apiRequest<DiscoverMeta>('/api/discover/meta', {}, { signal: options?.signal });
}

export async function getDiscoverPosts(params: DiscoverListParams, options?: RequestOptions) {
  return apiRequest<DiscoverListResponse>(
    `/api/discover/posts${buildQueryString({
      sort: params.sort,
      category: params.category,
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {},
    { signal: options?.signal }
  );
}

export async function getMyDiscoverPosts(params: DiscoverMyListParams, options?: RequestOptions) {
  return apiRequest<DiscoverListResponse>(
    `/api/discover/posts/me${buildQueryString({
      category: params.category,
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {},
    { signal: options?.signal }
  );
}

export async function getUserDiscoverPosts(
  userId: number,
  params: DiscoverMyListParams,
  options?: RequestOptions
) {
  return apiRequest<DiscoverListResponse>(
    `/api/discover/users/${userId}/posts${buildQueryString({
      category: params.category,
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {},
    { signal: options?.signal }
  );
}

export async function getDiscoverPostDetail(postId: number, options?: RequestOptions) {
  return apiRequest<DiscoverPost>(
    `/api/discover/posts/${postId}`,
    {},
    { signal: options?.signal }
  );
}

export async function createDiscoverPost(payload: CreateDiscoverPostPayload) {
  const formData = new FormData();
  formData.set('category', payload.category);

  formData.set('title', payload.title.trim());

  if (payload.storeName?.trim()) {
    formData.set('storeName', payload.storeName.trim());
  }

  if (payload.priceText?.trim()) {
    formData.set('priceText', payload.priceText.trim());
  }

  formData.set('content', payload.content.trim());

  payload.tags.forEach((tag) => {
    formData.append('tags', tag);
  });

  payload.images.forEach((image) => {
    formData.append('images', image);
  });

  return apiRequest<DiscoverPost>('/api/discover/posts', {
    method: 'POST',
    body: formData,
  });
}

export async function likeDiscoverPost(postId: number) {
  return apiRequest<DiscoverLikeResult>(`/api/discover/posts/${postId}/like`, {
    method: 'PUT',
  });
}

export async function unlikeDiscoverPost(postId: number) {
  return apiRequest<DiscoverLikeResult>(`/api/discover/posts/${postId}/like`, {
    method: 'DELETE',
  });
}

export async function deleteDiscoverPost(postId: number) {
  return apiRequest<{ id: number }>(`/api/discover/posts/${postId}`, {
    method: 'DELETE',
  });
}

export async function getDiscoverComments(
  postId: number,
  params: DiscoverCommentListParams,
  options?: RequestOptions
) {
  return apiRequest<DiscoverCommentListResponse>(
    `/api/discover/posts/${postId}/comments${buildQueryString({
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {},
    { signal: options?.signal }
  );
}

export async function createDiscoverComment(postId: number, payload: { content: string; parentCommentId?: number | null }) {
  return apiRequest<DiscoverComment>(`/api/discover/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      content: payload.content.trim(),
      parentCommentId: payload.parentCommentId ?? null,
    }),
  });
}

export async function deleteDiscoverComment(commentId: number) {
  return apiRequest<{ id: number; postId: number }>(`/api/discover/comments/${commentId}`, {
    method: 'DELETE',
  });
}
