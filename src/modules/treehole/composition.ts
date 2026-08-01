/**
 * [INPUT]: 依赖调用方注入的 Drizzle db、CommunityProfileReader、Notifications ports、Treehole policy/媒体路径与有界上传并发配置
 * [OUTPUT]: 对外提供 createTreeholeComposition，构造 application、受限 multipart HTTP、私有媒体与 Operations 只读端口
 * [POS]: modules/treehole 的无全局状态装配工厂，所有媒体与门禁实例均局部归属当前应用组合
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfileReader } from '../community/domain/ports';
import type {
  ActivityOutboxWriter,
  ActivityProjectionTrigger,
} from '../notifications/domain/ports';
import { TreeholeApplicationService } from './application/treehole-application-service';
import type { TreeholePolicy } from './domain/treehole';
import { createTreeholeRoutes } from './http/treehole.routes';
import { TreeholeUploadGate } from './http/treehole-upload-gate';
import { SQLiteTreeholeOperationsQuery } from './infrastructure/sqlite-treehole-operations-query';
import { SQLiteTreeholePersistence } from './infrastructure/sqlite-treehole-persistence';
import {
  TreeholePostMediaStorage,
  type TreeholePostMediaOptions,
} from './infrastructure/treehole-post-media-storage';
import type {
  TreeholeDatabase,
  TreeholeTransaction,
} from './infrastructure/sqlite-treehole-support';

export interface TreeholeCompositionOptions {
  db: TreeholeDatabase;
  profiles: CommunityProfileReader;
  policy: TreeholePolicy;
  activityOutbox: ActivityOutboxWriter<TreeholeTransaction>;
  activityProjection: ActivityProjectionTrigger;
  media: TreeholePostMediaOptions;
  upload?: {
    maxActive: number;
    maxQueued: number;
  };
}

export function createTreeholeComposition(options: TreeholeCompositionOptions) {
  const media = new TreeholePostMediaStorage(options.db, options.policy, options.media);
  const persistence = new SQLiteTreeholePersistence(
    options.db,
    options.profiles,
    media,
    options.activityOutbox,
  );
  const service = new TreeholeApplicationService(
    persistence,
    media,
    options.policy,
    options.activityProjection,
  );
  const uploadGate = new TreeholeUploadGate(
    options.upload?.maxActive ?? 1,
    options.upload?.maxQueued ?? 2,
  );
  return {
    service,
    routes: createTreeholeRoutes(service, {
      maxImagesPerPost: options.policy.maxImagesPerPost,
      maxImageBytes: options.policy.maxImageBytes,
      maxImageTotalBytes: options.policy.maxImageTotalBytes,
    }, uploadGate),
    media,
    operationsQuery: new SQLiteTreeholeOperationsQuery(
      options.db,
      options.profiles,
      media,
      options.policy,
    ),
  };
}
