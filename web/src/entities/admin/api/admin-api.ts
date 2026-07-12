/**
 * [INPUT]: 依赖本模块相邻类型、API 与应用基础设施
 * [OUTPUT]: 提供 admin-api.ts 的公开前端契约与运行能力
 * [POS]: web 应用分层中的现有业务边界，被页面或上层模块消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { apiRequest } from '@/shared/api/http-client';
import type {
  AdminAnnouncement,
  AdminAnnouncementPayload,
  AdminAnnouncementUpdatePayload,
  AdminAnalyticsOverview,
  AdminComplianceStatus,
  AdminDashboardResponse,
  AdminTerminalLogResponse,
  AdminTreeholeCommentListResponse,
  AdminTreeholePostListResponse,
} from '@/entities/admin/model/admin-types';

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

export async function getAdminDashboard(
  params: { page?: number; search?: string; major?: string; grade?: string },
  options?: RequestOptions
) {
  return apiRequest<AdminDashboardResponse>(
    `/api/admin/dashboard${buildQueryString({
      page: params.page,
      search: params.search,
      major: params.major,
      grade: params.grade,
    })}`,
    {},
    { auth: false, signal: options?.signal }
  );
}

export async function getAdminAnalyticsOverview(
  days: 7 | 30 | 90,
  options?: RequestOptions
) {
  return apiRequest<AdminAnalyticsOverview>(
    `/api/admin/analytics/overview?days=${days}`,
    {},
    { auth: false, signal: options?.signal }
  );
}

export async function getAdminComplianceStatus(options?: RequestOptions) {
  return apiRequest<AdminComplianceStatus>('/api/admin/compliance/ugc', {}, { auth: false, signal: options?.signal });
}

export async function updateAdminComplianceStatus(
  payload: Pick<AdminComplianceStatus, 'mode' | 'discoverMockText' | 'treeholeMockText'>
) {
  return apiRequest<AdminComplianceStatus>(
    '/api/admin/compliance/ugc',
    { method: 'PUT', body: JSON.stringify(payload) },
    { auth: false }
  );
}

export async function getAdminAnnouncements(options?: RequestOptions) {
  return apiRequest<AdminAnnouncement[]>(
    '/api/admin/announcements',
    {},
    { auth: false, signal: options?.signal }
  );
}

export async function createAdminAnnouncement(payload: AdminAnnouncementPayload) {
  return apiRequest<AdminAnnouncement>(
    '/api/admin/announcements',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { auth: false }
  );
}

export async function updateAdminAnnouncement(
  id: string,
  payload: AdminAnnouncementUpdatePayload
) {
  return apiRequest<AdminAnnouncement>(
    `/api/admin/announcements/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    { auth: false }
  );
}

export async function deleteAdminAnnouncement(id: string) {
  return apiRequest<{ id: string }>(
    `/api/admin/announcements/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
    { auth: false }
  );
}

export async function deleteAdminDiscoverPost(postId: number) {
  return apiRequest<{ id: number }>(
    `/api/admin/discover/posts/${postId}`,
    {
      method: 'DELETE',
    },
    { auth: false }
  );
}

export async function getAdminTreeholePosts(
  params: { keyword?: string; page?: number; pageSize?: number },
  options?: RequestOptions
) {
  return apiRequest<AdminTreeholePostListResponse>(
    `/api/admin/treehole/posts${buildQueryString({
      keyword: params.keyword,
      page: params.page,
      pageSize: params.pageSize,
    })}`,
    {},
    { auth: false, signal: options?.signal }
  );
}

export async function getAdminTreeholeComments(
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
    },
    { auth: false, signal: options?.signal }
  );
}

export async function deleteAdminTreeholePost(postId: number) {
  return apiRequest<{ id: number }>(
    `/api/admin/treehole/posts/${postId}`,
    {
      method: 'DELETE',
    },
    { auth: false }
  );
}

export async function deleteAdminTreeholeComment(commentId: number) {
  return apiRequest<{ id: number; postId: number }>(
    `/api/admin/treehole/comments/${commentId}`,
    {
      method: 'DELETE',
    },
    { auth: false }
  );
}

export async function getAdminTerminalLogs(
  params: { limit?: number; keyword?: string },
  options?: RequestOptions
) {
  return apiRequest<AdminTerminalLogResponse>(
    `/api/admin/logs${buildQueryString({
      limit: params.limit,
      keyword: params.keyword,
    })}`,
    {},
    { auth: false, signal: options?.signal }
  );
}
