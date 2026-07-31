/**
 * [INPUT]: 依赖调用方注入的 Drizzle db、CommunityProfileReader、Notifications Outbox/投影 ports 与 Treehole policy
 * [OUTPUT]: 对外提供 createTreeholeComposition，构造 application、HTTP factory 结果与 Operations 只读端口
 * [POS]: modules/treehole 的无全局状态装配工厂，不创建跨模块 concrete singleton
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
import { SQLiteTreeholeOperationsQuery } from './infrastructure/sqlite-treehole-operations-query';
import { SQLiteTreeholePersistence } from './infrastructure/sqlite-treehole-persistence';
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
}

export function createTreeholeComposition(options: TreeholeCompositionOptions) {
  const persistence = new SQLiteTreeholePersistence(
    options.db,
    options.profiles,
    options.activityOutbox,
  );
  const service = new TreeholeApplicationService(
    persistence,
    options.policy,
    options.activityProjection,
  );
  return {
    service,
    routes: createTreeholeRoutes(service),
    operationsQuery: new SQLiteTreeholeOperationsQuery(options.db, options.profiles, options.policy),
  };
}
