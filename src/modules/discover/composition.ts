/**
 * [INPUT]: 依赖上层注入的 Drizzle db、CommunityProfileReader、Notifications Outbox/投影 ports，以及模块内 application/infrastructure 和运行配置
 * [OUTPUT]: 对外提供 createDiscoverModule(dependencies)，返回 service、routes、media 与 Operations query 实例
 * [POS]: modules/discover 的局部组合根，只组装本纵向切片，不创建跨模块 concrete singleton
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../config';
import type { getDb } from '../../db';
import type { CommunityProfileReader } from '../community/domain/ports';
import type {
  ActivityOutboxWriter,
  ActivityProjectionTrigger,
} from '../notifications/domain/ports';
import { DiscoverApplicationService } from './application/discover-application-service';
import { createDiscoverRoutes } from './http/discover.routes';
import { DiscoverMediaService } from './infrastructure/discover-media-service';
import { SQLiteDiscoverOperationsQuery } from './infrastructure/sqlite-discover-operations-query';
import { SQLiteDiscoverPersistence } from './infrastructure/sqlite-discover-persistence';
import type { DiscoverTransaction } from './infrastructure/discover-mapping';

export type DiscoverDatabase = ReturnType<typeof getDb>;

export interface DiscoverModuleDependencies {
  db: DiscoverDatabase;
  profileReader: CommunityProfileReader;
  activityOutbox: ActivityOutboxWriter<DiscoverTransaction>;
  activityProjection: ActivityProjectionTrigger;
}

export function createDiscoverModule(dependencies: DiscoverModuleDependencies) {
  const policy = {
    maxImagesPerPost: config.discover.maxImagesPerPost,
    maxTagsPerPost: config.discover.maxTagsPerPost,
    maxTitleLength: config.discover.maxTitleLength,
    maxTagLength: config.discover.maxTagLength,
    maxStoreNameLength: config.discover.maxStoreNameLength,
    maxPriceTextLength: config.discover.maxPriceTextLength,
    maxContentLength: config.discover.maxContentLength,
    maxCommentLength: config.discover.maxCommentLength,
    defaultCommentPageSize: config.discover.defaultCommentPageSize,
    maxCommentPageSize: config.discover.maxCommentPageSize,
  };
  const persistence = new SQLiteDiscoverPersistence(
    dependencies.db,
    dependencies.profileReader,
    policy,
    dependencies.activityOutbox,
  );
  const media = new DiscoverMediaService(dependencies.db);
  const service = new DiscoverApplicationService(
    persistence,
    media,
    policy,
    dependencies.activityProjection,
  );

  return {
    service,
    routes: createDiscoverRoutes(service, {
      maxImagesPerPost: policy.maxImagesPerPost,
      imageMaxBytes: config.discover.imageMaxBytes,
    }),
    media,
    operationsQuery: new SQLiteDiscoverOperationsQuery(dependencies.db, dependencies.profileReader),
  };
}
