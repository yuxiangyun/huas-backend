/**
 * [INPUT]: 依赖 Identity/Discover 公开只读 query ports 与构造注入的公告、日志、系统端口
 * [OUTPUT]: 对外提供 AdminDashboardApplicationService，保持后台 Dashboard 完整响应契约
 * [POS]: operations/application 的管理聚合用例，不知道任何跨领域表、Drizzle 或文件系统实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { DiscoverOperationsQueryPort } from '../../discover/domain/operations-query';
import type { IdentityOperationsQueryPort } from '../../identity/domain/operations-query';
import { beijingIsoString, startOfBeijingDay } from '../../../utils/time';
import type { DashboardQuery } from '../domain/operations';
import type { AnnouncementQueryPort, SystemOperationsPort, TerminalLogQueryPort } from '../domain/ports';

const PAGE_SIZE = 20;
const LOG_LIMIT = 50;
const DISCOVER_POST_LIMIT = 20;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export class AdminDashboardApplicationService {
  constructor(
    private readonly identityQuery: IdentityOperationsQueryPort,
    private readonly discoverQuery: DiscoverOperationsQueryPort,
    private readonly announcements: AnnouncementQueryPort,
    private readonly terminalLogs: TerminalLogQueryPort,
    private readonly system: SystemOperationsPort,
  ) {}

  async getDashboard(query: DashboardQuery) {
    const now = new Date();
    const nowMs = now.getTime();
    const [identity, discover, announcements, logs] = await Promise.all([
      this.identityQuery.getSnapshot({
        page: parsePositiveInt(query.page, 1),
        pageSize: PAGE_SIZE,
        search: (query.search || '').trim(),
        major: (query.major || '').trim(),
        grade: (query.grade || '').trim(),
        todayStartMs: startOfBeijingDay(now).getTime(),
        sevenDaysAgoMs: nowMs - 7 * 24 * 60 * 60 * 1000,
      }),
      this.discoverQuery.getSnapshot(DISCOVER_POST_LIMIT),
      this.announcements.listAdmin(),
      this.terminalLogs.list({ limit: LOG_LIMIT }),
    ]);
    const system = this.system.snapshot();

    return {
      service: { status: system.databaseStatus, timestamp: beijingIsoString(now) },
      metrics: {
        ...identity.metrics,
        totalDiscoverPosts: discover.totalPosts,
        totalDiscoverLikes: discover.totalLikes,
        memory: system.memory,
        uptimeSeconds: system.uptimeSeconds,
      },
      distributions: identity.distributions,
      users: identity.users,
      discover,
      logs,
      announcements,
    };
  }
}
