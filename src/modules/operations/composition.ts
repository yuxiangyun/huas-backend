/**
 * [INPUT]: 依赖 Operations application/infrastructure 与 Identity/Discover/Treehole 公开 query adapters
 * [OUTPUT]: 对外提供生产 application 实例、SystemOperations 与 AdminDashboardService 兼容静态类
 * [POS]: modules/operations 的唯一 composition root，集中完成跨域只读端口和本模块基础设施装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { SQLiteDiscoverOperationsQuery } from '../discover/infrastructure/sqlite-discover-operations-query';
import { SQLiteIdentityOperationsQuery } from '../identity/infrastructure/sqlite-identity-operations-query';
import { configureLoginAnalyticsRecorder } from '../identity/http/login-analytics';
import { SQLiteTreeholeOperationsQuery } from '../treehole/infrastructure/sqlite-treehole-operations-query';
import { AdminDashboardApplicationService } from './application/admin-dashboard-service';
import { CommunityAdminApplicationService } from './application/community-admin-service';
import type { DashboardQuery } from './domain/operations';
import { AnnouncementService } from './infrastructure/announcement-service';
import { AnalyticsService } from './infrastructure/analytics-service';
import { DiscoverAdminCommandAdapter, TreeholeAdminCommandAdapter } from './infrastructure/community-admin-adapters';
import { SystemOperations } from './infrastructure/system-operations';
import { TerminalLogService } from './infrastructure/terminal-log-service';

export const systemOperations = new SystemOperations();

configureLoginAnalyticsRecorder((platformHeader, success) => {
  AnalyticsService.recordLogin(platformHeader, success);
});

export const adminDashboardApplicationService = new AdminDashboardApplicationService(
  new SQLiteIdentityOperationsQuery(),
  new SQLiteDiscoverOperationsQuery(),
  AnnouncementService,
  TerminalLogService,
  systemOperations,
);

export const communityAdminApplicationService = new CommunityAdminApplicationService(
  new SQLiteTreeholeOperationsQuery(),
  new DiscoverAdminCommandAdapter(),
  new TreeholeAdminCommandAdapter(),
);

export class AdminDashboardService {
  static getDashboard(query: DashboardQuery) {
    return adminDashboardApplicationService.getDashboard(query);
  }
}
