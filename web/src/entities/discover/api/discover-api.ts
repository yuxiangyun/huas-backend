/**
 * [INPUT]: 依赖共享 apiRequest、普通用户认证事实与 Discover 稳定 DTO
 * [OUTPUT]: 对外提供匿名/认证自适应只读请求，以及受认证保护的本人帖子、创建删除和幂等点赞请求
 * [POS]: entities/discover 的 HTTP adapter，将公开橱窗读取路由与 Bearer 写入路由收敛在同一图文协议边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { apiRequest } from '@/shared/api/http-client';
import { useAuthStore } from '@/entities/auth/model/auth-store';
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

function discoverReadRequest<T>(path: string, signal?: AbortSignal) {
  const isAuthenticated = useAuthStore.getState().isAuthenticated;
  const basePath = isAuthenticated ? '/api/discover' : '/api/public/discover';
  return apiRequest<T>(`${basePath}${path}`, {}, { auth: isAuthenticated, signal });
}

export async function getDiscoverMeta(options?: RequestOptions) {
  return discoverReadRequest<DiscoverMeta>('/meta', options?.signal);
}

export async function getDiscoverPosts(params: DiscoverListParams, options?: RequestOptions) {
  return discoverReadRequest<DiscoverListResponse>(
    `/posts${buildQueryString({
      sort: params.sort,
      category: params.category,
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    options?.signal,
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
  return discoverReadRequest<DiscoverPost>(`/posts/${postId}`, options?.signal);
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
  return discoverReadRequest<DiscoverCommentListResponse>(
    `/posts/${postId}/comments${buildQueryString({
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    options?.signal,
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
