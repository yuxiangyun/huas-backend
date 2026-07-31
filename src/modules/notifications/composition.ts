/**
 * [INPUT]: 依赖上层注入的 Drizzle db、CommunityProfileReader、可选策略与模块内 application/infrastructure/http 构造器
 * [OUTPUT]: 对外提供 createNotificationsModule(dependencies)，返回 routes/service/outboxWriter/projector 实例
 * [POS]: modules/notifications 的局部组合根，通知永久保留，只把 Outbox 重试调度权留给根 composition
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfileReader } from '../community/domain/ports';
import { ActivityOutboxProjector } from './application/activity-outbox-projector';
import { NotificationApplicationService } from './application/notification-application-service';
import {
  DEFAULT_NOTIFICATIONS_POLICY,
  type NotificationsPolicy,
} from './domain/notification';
import { createNotificationRoutes } from './http/notification.routes';
import {
  SQLiteActivityOutboxStore,
  SQLiteActivityOutboxWriter,
  type NotificationsDatabase,
} from './infrastructure/sqlite-activity-outbox';
import { SQLiteNotificationRepository } from './infrastructure/sqlite-notification-repository';

export interface NotificationsModuleDependencies {
  db: NotificationsDatabase;
  profileReader: CommunityProfileReader;
  policy?: Partial<NotificationsPolicy>;
}

function resolvePolicy(overrides: Partial<NotificationsPolicy> = {}): NotificationsPolicy {
  const policy = { ...DEFAULT_NOTIFICATIONS_POLICY, ...overrides };
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Notifications policy ${name} must be positive.`);
    }
  }
  if (policy.defaultPageSize > policy.maxPageSize) {
    throw new Error('Notifications defaultPageSize must not exceed maxPageSize.');
  }
  return policy;
}

export function createNotificationsModule(dependencies: NotificationsModuleDependencies) {
  const policy = resolvePolicy(dependencies.policy);
  const repository = new SQLiteNotificationRepository(dependencies.db);
  const service = new NotificationApplicationService(
    repository,
    dependencies.profileReader,
    policy,
  );
  const outboxStore = new SQLiteActivityOutboxStore(dependencies.db);

  return {
    service,
    routes: createNotificationRoutes(service),
    outboxWriter: new SQLiteActivityOutboxWriter(),
    projector: new ActivityOutboxProjector(outboxStore, policy),
  };
}
