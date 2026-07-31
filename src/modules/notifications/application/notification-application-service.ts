/**
 * [INPUT]: 依赖 NotificationRepository、CommunityProfileReader 与 Notifications 纯映射/分页规则
 * [OUTPUT]: 对外提供 NotificationApplicationService 的普通列表、增量轮询、未读摘要和逐条已读用例
 * [POS]: modules/notifications/application 的用户读模型编排器，以 ID 高水位发现新增并以摘要总量支持撤销校准
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfile } from '../../community/domain/community';
import type { CommunityProfileReader } from '../../community/domain/ports';
import {
  clampNotificationPage,
  clampNotificationPageSize,
  normalizeNotificationAfterId,
  toNotificationResponse,
  type NotificationChangesOptions,
  type NotificationChangesResponse,
  type NotificationListOptions,
  type NotificationListResponse,
  type NotificationsPolicy,
} from '../domain/notification';
import type { NotificationRepository } from '../domain/ports';

function requireProfile(profiles: Map<number, CommunityProfile>, actorUserId: number) {
  const profile = profiles.get(actorUserId);
  if (!profile) throw new Error(`Community profile projection missing for actor ${actorUserId}`);
  return profile;
}

export class NotificationApplicationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly profiles: CommunityProfileReader,
    private readonly policy: NotificationsPolicy,
  ) {}

  async list(
    recipientUserId: number,
    options: NotificationListOptions = {},
  ): Promise<NotificationListResponse> {
    const page = clampNotificationPage(options.page);
    const pageSize = clampNotificationPageSize(options.pageSize, this.policy);
    const result = await this.repository.list(recipientUserId, page, pageSize);
    const profiles = await this.profiles.getMany(result.items.map((item) => item.actorUserId));
    return {
      items: result.items.map((item) => toNotificationResponse(
        item,
        requireProfile(profiles, item.actorUserId),
      )),
      page,
      pageSize,
      total: result.total,
      hasMore: page * pageSize < result.total,
    };
  }

  async listChanges(
    recipientUserId: number,
    options: NotificationChangesOptions = {},
  ): Promise<NotificationChangesResponse> {
    const afterNotificationId = normalizeNotificationAfterId(options.afterNotificationId);
    const limit = clampNotificationPageSize(options.limit, this.policy);
    const rows = await this.repository.listChanges(
      recipientUserId,
      afterNotificationId,
      limit + 1,
    );
    const selected = rows.slice(0, limit);
    const profiles = await this.profiles.getMany(selected.map((item) => item.actorUserId));
    return {
      items: selected.map((item) => toNotificationResponse(
        item,
        requireProfile(profiles, item.actorUserId),
      )),
      afterNotificationId: selected.at(-1)?.id ?? afterNotificationId,
      hasMore: rows.length > limit,
    };
  }

  countUnread(recipientUserId: number): Promise<number> {
    return this.repository.countUnread(recipientUserId);
  }

  summarize(recipientUserId: number) {
    return this.repository.summarize(recipientUserId);
  }

  markRead(recipientUserId: number, notificationId: number): Promise<boolean> {
    return this.repository.markRead(recipientUserId, notificationId, new Date());
  }
}
