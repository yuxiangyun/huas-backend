import { apiRequest } from '@/shared/api/http-client';
import type {
  DiscoverListResponse,
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

export async function rateDiscoverPost(postId: number, score: number) {
  return apiRequest<DiscoverPost>(`/api/discover/posts/${postId}/rating`, {
    method: 'POST',
    body: JSON.stringify({ score }),
  });
}

export async function deleteDiscoverPost(postId: number) {
  return apiRequest<{ id: number }>(`/api/discover/posts/${postId}`, {
    method: 'DELETE',
  });
}
