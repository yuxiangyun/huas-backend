/**
 * [INPUT]: 依赖 CommunityProfile 并对齐服务端 Notifications 六类活动读模型
 * [OUTPUT]: 对外提供活动通知、分页、增量与未读/总量摘要类型
 * [POS]: entities/notifications 的领域契约核心，以总量差异补足撤销删除感知且不复制互动正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfile } from '@/entities/community/model/community-types';

export type NotificationType =
  | 'discover_like'
  | 'discover_comment'
  | 'discover_comment_reply'
  | 'treehole_like'
  | 'treehole_comment'
  | 'treehole_comment_reply';

export type NotificationResourceType = 'discover_post' | 'treehole_post';

export interface ActivityNotification {
  id: number;
  actor: CommunityProfile;
  type: NotificationType;
  resourceType: NotificationResourceType;
  resourceId: number;
  subresourceId: number | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: ActivityNotification[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface NotificationChangesResponse {
  items: ActivityNotification[];
  afterNotificationId: number;
  hasMore: boolean;
}

export interface NotificationUnreadCount {
  unreadCount: number;
  total: number;
}
