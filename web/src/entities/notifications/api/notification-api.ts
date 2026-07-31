/**
 * [INPUT]: 依赖共享 apiRequest 与 Notifications DTO
 * [OUTPUT]: 对外提供通知分页、ID 高水位增量、未读/总量摘要与逐条已读请求
 * [POS]: entities/notifications 的 HTTP adapter，以摘要 total 支持撤销后的列表校准
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { apiRequest } from '@/shared/api/http-client';
import type {
  NotificationChangesResponse,
  NotificationListResponse,
  NotificationUnreadCount,
} from '@/entities/notifications/model/notification-types';

interface RequestOptions {
  signal?: AbortSignal;
}

function queryString(params: Record<string, number>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => searchParams.set(key, String(value)));
  return `?${searchParams.toString()}`;
}

export function getNotifications(page: number, pageSize: number, options?: RequestOptions) {
  return apiRequest<NotificationListResponse>(
    `/api/notifications${queryString({ page, pageSize })}`,
    {},
    { signal: options?.signal }
  );
}

export function getNotificationChanges(afterNotificationId: number, limit: number, options?: RequestOptions) {
  return apiRequest<NotificationChangesResponse>(
    `/api/notifications/changes${queryString({ afterNotificationId, limit })}`,
    {},
    { signal: options?.signal }
  );
}

export function getNotificationUnreadCount(options?: RequestOptions) {
  return apiRequest<NotificationUnreadCount>('/api/notifications/unread-count', {}, { signal: options?.signal });
}

export function markNotificationRead(notificationId: number) {
  return apiRequest<{ id: number; read: true }>(`/api/notifications/${notificationId}/read`, { method: 'PUT' });
}
