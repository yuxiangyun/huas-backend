/**
 * [INPUT]: 依赖 Community 公共资料 DTO、共享错误与北京时间格式化，不依赖 HTTP、SQLite 或进程调度
 * [OUTPUT]: 对外提供通知事实/响应、安全 ID/分页 offset、增量游标与未读摘要 DTO、策略边界及公共 actor 映射纯函数
 * [POS]: modules/notifications/domain 的永久读模型内核，以通知 ID 发现新增、以摘要总量感知撤销且不返回互动正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
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

export interface NotificationSummary {
  unreadCount: number;
  total: number;
}

export function clampNotificationPage(value: number | undefined): number {
  return value === undefined ? 1 : requirePositiveInteger(value, '分页参数不合法');
}

export function clampNotificationPageSize(
  value: number | undefined,
  policy: NotificationsPolicy,
): number {
  if (value === undefined) return policy.defaultPageSize;
  return Math.min(requirePositiveInteger(value, '分页参数不合法'), policy.maxPageSize);
}

export function notificationPageOffset(page: number, pageSize: number): number {
  requirePositiveInteger(page, '分页参数不合法');
  requirePositiveInteger(pageSize, '分页参数不合法');
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) {
    throw new AppError(ErrorCode.PARAM_ERROR, '分页范围不合法');
  }
  return offset;
}

export function normalizeNotificationAfterId(value: number | undefined): number {
  const afterNotificationId = value === undefined ? 0 : value;
  if (!Number.isSafeInteger(afterNotificationId) || afterNotificationId < 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, '通知增量参数不合法');
  }
  return afterNotificationId;
}

export function normalizeNotificationId(value: number): number {
  return requirePositiveInteger(value, '通知 ID 不合法');
}

function requirePositiveInteger(value: number, message: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, message);
  }
  return value;
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
