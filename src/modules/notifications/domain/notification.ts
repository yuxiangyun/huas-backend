/**
 * [INPUT]: 依赖 Community 公共资料 DTO 与共享北京时间格式化，不依赖 HTTP、SQLite 或进程调度
 * [OUTPUT]: 对外提供通知事实/响应、普通分页与增量游标 DTO、策略边界及公共 actor 映射纯函数
 * [POS]: modules/notifications/domain 的永久读模型内核，以通知 ID 为轮询高水位且不保存或返回互动正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beijingIsoString } from '../../../utils/time';
import type { CommunityProfile } from '../../community/domain/community';
import type { ActivityNotificationType, ActivityResourceType } from './activity';

export interface NotificationsPolicy {
  defaultPageSize: number;
  maxPageSize: number;
  projectionBatchSize: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}

export const DEFAULT_NOTIFICATIONS_POLICY: NotificationsPolicy = {
  defaultPageSize: 20,
  maxPageSize: 50,
  projectionBatchSize: 100,
  retryBaseDelayMs: 1_000,
  retryMaxDelayMs: 5 * 60_000,
};

export interface NotificationFact {
  id: number;
  eventId: string;
  recipientUserId: number;
  actorUserId: number;
  type: ActivityNotificationType;
  resourceType: ActivityResourceType;
  resourceId: number;
  subresourceId: number | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationResponse {
  id: number;
  actor: CommunityProfile;
  type: ActivityNotificationType;
  resourceType: ActivityResourceType;
  resourceId: number;
  subresourceId: number | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface NotificationListOptions {
  page?: number;
  pageSize?: number;
}

export interface NotificationChangesOptions {
  afterNotificationId?: number;
  limit?: number;
}

export interface NotificationChangesResponse {
  items: NotificationResponse[];
  afterNotificationId: number;
  hasMore: boolean;
}

export function clampNotificationPage(value: number | undefined): number {
  if (!value || !Number.isFinite(value) || value <= 0) return 1;
  return Math.floor(value);
}

export function clampNotificationPageSize(
  value: number | undefined,
  policy: NotificationsPolicy,
): number {
  if (!value || !Number.isFinite(value) || value <= 0) return policy.defaultPageSize;
  return Math.min(Math.floor(value), policy.maxPageSize);
}

export function normalizeNotificationAfterId(value: number | undefined): number {
  return value === undefined ? 0 : value;
}

export function toNotificationResponse(
  fact: NotificationFact,
  actor: CommunityProfile,
): NotificationResponse {
  return {
    id: fact.id,
    actor,
    type: fact.type,
    resourceType: fact.resourceType,
    resourceId: fact.resourceId,
    subresourceId: fact.subresourceId,
    readAt: fact.readAt ? beijingIsoString(fact.readAt) : null,
    createdAt: beijingIsoString(fact.createdAt),
  };
}
