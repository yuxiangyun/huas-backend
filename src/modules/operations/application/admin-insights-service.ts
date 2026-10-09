import type { DiscoverOperationsQueryPort } from '../../discover/domain/operations-query';
import type { IdentityAdminUsersQuery, IdentityOperationsQueryPort } from '../../identity/domain/operations-query';
import { beijingIsoString, startOfBeijingDay } from '../../../utils/time';
import type { RuntimeMetricsQueryPort, SystemOperationsPort } from '../domain/ports';

export class AdminInsightsApplicationService {
  constructor(
    private readonly identity: IdentityOperationsQueryPort,
    private readonly discover: Pick<DiscoverOperationsQueryPort, 'getSummary'>,
    private readonly system: SystemOperationsPort,
    private readonly metrics: RuntimeMetricsQueryPort,
  ) {}

  listUsers(query: IdentityAdminUsersQuery) {
    return this.identity.listUsers(query);
  }

  async getOverview() {
    const now = new Date();
    const [identity, discover] = await Promise.all([
      this.identity.getOverview({
        todayStartMs: startOfBeijingDay(now).getTime(),
        sevenDaysAgoMs: now.getTime() - 7 * 86_400_000,
      }),
      this.discover.getSummary(),
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
      distributions: { byClass: identity.distributions.byMajor, byGrade: identity.distributions.byGrade },
    };
  }

  getRuntime() {
    return { ...this.system.snapshot(), process: this.system.healthStatus(), metrics: this.metrics.samples() };
  }
}
