/**
 * [INPUT]: 依赖 NotificationRepository 与 Notifications 已读保留策略
 * [OUTPUT]: 对外提供 ReadNotificationCleanupService.run()，仅清理超过保留期的已读活动通知
 * [POS]: modules/notifications/application 的可重建维护用例，由 runtime periodic registry 调度且不触碰未读事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { NotificationsPolicy } from '../domain/notification';
import type { NotificationRepository } from '../domain/ports';

export class ReadNotificationCleanupService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly policy: NotificationsPolicy,
  ) {}

  run(now: Date = new Date()): Promise<number> {
    const before = new Date(now.getTime() - this.policy.readRetentionMs);
    return this.repository.deleteReadBefore(before);
  }
}
