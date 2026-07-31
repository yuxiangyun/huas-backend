/**
 * [INPUT]: 依赖上层注入的 Drizzle db、CommunityProfileReader、message-media 路径与可选 Messaging 策略
 * [OUTPUT]: 对外提供 createMessagingModule(dependencies)，返回 routes/service/operationsQuery/orphanMediaCleanup/media 实例
 * [POS]: modules/messaging 的局部组合根，只装配本切片并把 HTTP、Operations 与周期任务控制权留给根 composition
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfileReader } from '../community/domain/ports';
import { MessagingApplicationService } from './application/messaging-application-service';
import { MessagingOperationsQueryService } from './application/messaging-operations-query-service';
import { OrphanMessageMediaCleanupService } from './application/orphan-message-media-cleanup-service';
import {
  DEFAULT_MESSAGING_POLICY,
  type MessagingPolicy,
} from './domain/messaging';
import { createMessagingRoutes } from './http/messaging.routes';
import {
  MessagingMediaStorage,
  type MessagingMediaOptions,
} from './infrastructure/messaging-media-storage';
import {
  SQLiteMessagingRepository,
  type MessagingDatabase,
} from './infrastructure/sqlite-messaging-repository';

export interface MessagingModuleDependencies {
  db: MessagingDatabase;
  profileReader: CommunityProfileReader;
  media: MessagingMediaOptions;
  policy?: Partial<MessagingPolicy>;
  now?: () => Date;
}

export function createMessagingModule(dependencies: MessagingModuleDependencies) {
  const policy = resolvePolicy(dependencies.policy);
  const repository = new SQLiteMessagingRepository(dependencies.db, policy);
  const media = new MessagingMediaStorage(dependencies.db, policy, dependencies.media);
  const service = new MessagingApplicationService(
    repository,
    media,
    dependencies.profileReader,
    policy,
    dependencies.now,
  );
  const operationsQuery = new MessagingOperationsQueryService(
    repository,
    media,
    dependencies.profileReader,
    policy,
  );

  return {
    service,
    routes: createMessagingRoutes(service),
    operationsQuery,
    orphanMediaCleanup: new OrphanMessageMediaCleanupService(media, policy),
    media,
  };
}

function resolvePolicy(overrides: Partial<MessagingPolicy> = {}): MessagingPolicy {
  const policy = { ...DEFAULT_MESSAGING_POLICY, ...overrides };
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Messaging policy ${name} must be positive.`);
    }
  }
  if (policy.maxImageBytes > policy.maxTotalImageBytes) {
    throw new Error('Messaging maxImageBytes must not exceed maxTotalImageBytes.');
  }
  if (policy.defaultConversationPageSize > policy.maxConversationPageSize) {
    throw new Error('Messaging defaultConversationPageSize must not exceed maxConversationPageSize.');
  }
  if (policy.defaultMessagePageSize > policy.maxMessagePageSize) {
    throw new Error('Messaging defaultMessagePageSize must not exceed maxMessagePageSize.');
  }
  return policy;
}
