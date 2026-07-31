/**
 * [INPUT]: 依赖 NotificationRepository、CommunityProfileReader 与 Notifications 纯映射/分页规则
 * [OUTPUT]: 对外提供 NotificationApplicationService 的列表、未读计数和逐条已读用例
 * [POS]: modules/notifications/application 的用户读模型编排器，批量取得 actor 公共资料并维持 recipient 权限边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfile } from '../../community/domain/community';
import type { CommunityProfileReader } from '../../community/domain/ports';
import {
  clampNotificationPage,
  clampNotificationPageSize,
  toNotificationResponse,
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

  countUnread(recipientUserId: number): Promise<number> {
    return this.repository.countUnread(recipientUserId);
  }

  markRead(recipientUserId: number, notificationId: number): Promise<boolean> {
    return this.repository.markRead(recipientUserId, notificationId, new Date());
  }
}
