/**
 * [INPUT]: 依赖 AdminDashboardApplicationService 与内存 fake ports
 * [OUTPUT]: 验证 Dashboard 只经构造注入 query ports 聚合且保持分页、指标、内容响应形状
 * [POS]: tests 的 Operations application 隔离测试，不初始化 SQLite 或文件系统
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { AdminDashboardApplicationService } from '../src/modules/operations/application/admin-dashboard-service';
import type { IdentityOperationsQuery } from '../src/modules/identity/domain/operations-query';

describe('operations dashboard application', () => {
  it('aggregates stable query DTOs without knowing persistence details', async () => {
    let identityInput: IdentityOperationsQuery | null = null;
    const service = new AdminDashboardApplicationService(
      {
        async getSnapshot(query) {
          identityInput = query;
          return {
            metrics: {
              totalUsers: 2,
              todayActiveUsers: 1,
              activeUsers7d: 2,
              newUsers7d: 1,
              cacheEntries: 3,
              credentialEntries: 4,
            },
            distributions: { byMajor: [{ className: '软件工程', count: 2 }], byGrade: [{ grade: '2024', count: 2 }] },
            users: {
              page: 1,
              pageSize: 20,
              total: 2,
              totalPages: 1,
              filters: { search: query.search, major: query.major, grade: query.grade },
              options: { majors: [{ value: '软件工程', label: '软件工程' }], grades: ['2024'] },
              items: [],
            },
          };
        },
      },
      { async getSnapshot() { return { totalPosts: 5, totalRatings: 8, items: [] }; } },
      { async listAdmin() { return [{ id: 'notice' }]; } },
      { async list(query) { return { limit: query.limit || 50, keyword: '', items: [] }; } },
      {
        snapshot() {
          return {
            databaseStatus: 'ok',
            memory: { rssMb: 1, heapUsedMb: 2, heapTotalMb: 3 },
            uptimeSeconds: 4,
          };
        },
        healthStatus() {
          return { ready: true, shuttingDown: false, shutdownSignal: null, deploySlot: 'test' };
        },
        databaseIsHealthy() { return true; },
      },
    );

    const result = await service.getDashboard({ page: '2', search: '  Alice  ', grade: '2024' });
    expect(identityInput?.page).toBe(2);
    expect(identityInput?.search).toBe('Alice');
    expect(result.metrics.totalUsers).toBe(2);
    expect(result.metrics.totalDiscoverPosts).toBe(5);
    expect(result.discover.totalRatings).toBe(8);
    expect(result.announcements).toEqual([{ id: 'notice' }]);
    expect(result.logs.limit).toBe(50);
  });
});
