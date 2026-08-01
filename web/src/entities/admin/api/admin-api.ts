/**
 * [INPUT]: 依赖共享 apiRequest、后台 Cookie 会话与 entities/admin 的强类型协议
 * [OUTPUT]: 提供 dashboard、内容、日志、课表策略、含底部三态动作的首页弹窗 multipart 设置与私信只读管理边界
 * [POS]: entities/admin 的唯一 HTTP 适配边界，向查询层屏蔽路径、方法与 AbortSignal 细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { apiRequest } from '@/shared/api/http-client';
import type {
  AdminAnnouncement,
  AdminAnnouncementPayload,
  AdminAnnouncementUpdatePayload,
  AdminAnalyticsOverview,
  AdminDashboardResponse,
  AdminIndexPopupSettings,
  AdminIndexPopupSettingsPayload,
  AdminScheduleSourceMode,
  AdminScheduleSourcePolicy,
  AdminTerminalLogResponse,
  AdminMessagingConversationChangesResponse,
  AdminMessagingConversationListResponse,
  AdminMessagingMessageListResponse,
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

export async function getAdminScheduleSourcePolicy(options?: RequestOptions) {
  return apiRequest<AdminScheduleSourcePolicy>(
    '/api/admin/academic/schedule-source-policy',
    {},
    { auth: false, signal: options?.signal }
  );
}

export async function updateAdminScheduleSourcePolicy(mode: AdminScheduleSourceMode) {
  return apiRequest<AdminScheduleSourcePolicy>(
    '/api/admin/academic/schedule-source-policy',
    { method: 'PUT', body: JSON.stringify({ mode }) },
    { auth: false }
  );
}

export async function getAdminIndexPopupSettings(options?: RequestOptions) {
  return apiRequest<AdminIndexPopupSettings>(
    '/api/admin/index-popup',
    {},
    { auth: false, signal: options?.signal }
  );
}

export async function updateAdminIndexPopupSettings(payload: AdminIndexPopupSettingsPayload) {
  const form = new FormData();
  form.set('enabled', String(payload.enabled));
  form.set('actionType', payload.actionType);
  form.set('actionText', payload.actionText);
  form.set('frequency', payload.frequency);
  form.set('startsAt', payload.startsAt ?? '');
  form.set('endsAt', payload.endsAt ?? '');
  if (payload.image) form.set('image', payload.image);

  return apiRequest<AdminIndexPopupSettings>(
    '/api/admin/index-popup',
    { method: 'PUT', body: form },
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

export async function getAdminMessagingConversations(
  params: { page?: number; pageSize?: number },
  options?: RequestOptions
) {
  return apiRequest<AdminMessagingConversationListResponse>(
    `/api/admin/messaging/conversations${buildQueryString(params)}`,
    {},
    { auth: false, signal: options?.signal }
  );
}

export async function getAdminMessagingConversationChanges(
  afterMessageId: number,
  limit = 100,
  options?: RequestOptions
) {
  return apiRequest<AdminMessagingConversationChangesResponse>(
    `/api/admin/messaging/conversations/changes${buildQueryString({ afterMessageId, limit })}`,
    {},
    { auth: false, signal: options?.signal }
  );
}

export async function getAdminMessagingMessages(
  conversationId: number,
  params: { beforeMessageId?: number; afterMessageId?: number; limit?: number },
  options?: RequestOptions
) {
  return apiRequest<AdminMessagingMessageListResponse>(
    `/api/admin/messaging/conversations/${conversationId}/messages${buildQueryString(params)}`,
    {},
    { auth: false, signal: options?.signal }
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
