/**
 * [INPUT]: 依赖调用方注入的 Identity/Discover/Treehole/Messaging 公开查询、Early Rising 设置、命令与私有媒体 ports，以及 Operations 自有 application/infrastructure
 * [OUTPUT]: 对外提供 createOperationsComposition 与进程级 systemOperations，并把 Early Rising 管理设置端口交给后台 HTTP
 * [POS]: modules/operations 的局部组合工厂，只聚合公开端口；跨模块 concrete 装配统一留在 src/composition.ts
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { DiscoverOperationsQueryPort } from '../discover/domain/operations-query';
import type { IdentityOperationsQueryPort } from '../identity/domain/operations-query';
import { configureLoginAnalyticsRecorder } from '../identity/http/login-analytics';
import type { MessagingOperationsQueryPort } from '../messaging/domain/ports';
import type { TreeholeOperationsQueryPort } from '../treehole/domain/operations-query';
import type { TreeholeMediaReader } from '../treehole/domain/ports';
import { AdminDashboardApplicationService } from './application/admin-dashboard-service';
import { CommunityAdminApplicationService } from './application/community-admin-service';
import { MessagingAdminApplicationService } from './application/messaging-admin-service';
import type {
  DiscoverAdminCommandPort,
  EarlyRisingAdminSettingsPort,
  TreeholeAdminCommandPort,
} from './domain/ports';
import { createAdminRoutes } from './http/admin.routes';
import { AnnouncementService } from './infrastructure/announcement-service';
import { AnalyticsService } from './infrastructure/analytics-service';
import { SystemOperations } from './infrastructure/system-operations';
import { TerminalLogService } from './infrastructure/terminal-log-service';

export const systemOperations = new SystemOperations();

configureLoginAnalyticsRecorder((platformHeader, success) => {
  AnalyticsService.recordLogin(platformHeader, success);
});

export interface OperationsCompositionDependencies {
  identityQuery: IdentityOperationsQueryPort;
  discoverQuery: DiscoverOperationsQueryPort;
  treeholeQuery: TreeholeOperationsQueryPort;
  treeholeMedia: Pick<TreeholeMediaReader, 'getForAdmin'>;
  messagingQuery: MessagingOperationsQueryPort;
  discoverCommands: DiscoverAdminCommandPort;
  treeholeCommands: TreeholeAdminCommandPort;
  earlyRisingSettings: EarlyRisingAdminSettingsPort;
}

export function createOperationsComposition(dependencies: OperationsCompositionDependencies) {
  const dashboard = new AdminDashboardApplicationService(
    dependencies.identityQuery,
    dependencies.discoverQuery,
    AnnouncementService,
    TerminalLogService,
    systemOperations,
  );
  const communityAdmin = new CommunityAdminApplicationService(
    dependencies.treeholeQuery,
    dependencies.treeholeMedia,
    dependencies.discoverCommands,
    dependencies.treeholeCommands,
  );
  const messagingAdmin = new MessagingAdminApplicationService(dependencies.messagingQuery);

  return {
    dashboard,
    communityAdmin,
    messagingAdmin,
    adminRoutes: createAdminRoutes({
      dashboard,
      communityAdmin,
      messagingAdmin,
      earlyRisingSettings: dependencies.earlyRisingSettings,
    }),
  };
}
