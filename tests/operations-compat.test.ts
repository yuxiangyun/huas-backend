/**
 * [INPUT]: 依赖 Operations canonical exports、旧 routes/services/middleware Facade 与源码依赖扫描
 * [OUTPUT]: 验证保留的旧出口引用一致、管理 HTTP 挂载兼容及 Operations 不依赖旧 Facade/跨域 schema
 * [POS]: tests 的 Operations 迁移兼容与依赖方向回归套件
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import canonicalAdminRoutes from '../src/modules/operations/http/admin.routes';
import canonicalPublicRoutes from '../src/modules/operations/http/public.routes';
import canonicalHealthRoutes from '../src/modules/operations/http/health.routes';
import legacyAdminRoutes from '../src/routes/admin/admin.routes';
import legacyPublicRoutes from '../src/routes/content/public.routes';
import legacyHealthRoutes from '../src/routes/system/health.routes';
import { AdminDashboardApplicationService as CanonicalDashboardService } from '../src/modules/operations/application/admin-dashboard-service';
import { AnalyticsService as CanonicalAnalyticsService } from '../src/modules/operations/infrastructure/analytics-service';
import { AnnouncementService as CanonicalAnnouncementService } from '../src/modules/operations/infrastructure/announcement-service';
import { TerminalLogService as CanonicalTerminalLogService } from '../src/modules/operations/infrastructure/terminal-log-service';
import * as canonicalSession from '../src/modules/operations/http/admin-session.middleware';
import { AdminDashboardService as LegacyDashboardService } from '../src/services/admin/dashboard-service';
import { AnalyticsService as LegacyAnalyticsService } from '../src/services/admin/analytics-service';
import { AnnouncementService as LegacyAnnouncementService } from '../src/services/content/announcement-service';
import { TerminalLogService as LegacyTerminalLogService } from '../src/services/admin/terminal-log-service';
import * as legacySession from '../src/middleware/admin-session.middleware';

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listTypeScriptFiles(path) : path.endsWith('.ts') ? [path] : [];
  }));
  return nested.flat();
}

describe('operations compatibility', () => {
  it('keeps legacy routes and service exports identical to canonical implementations', () => {
    expect(legacyAdminRoutes).toBe(canonicalAdminRoutes);
    expect(legacyPublicRoutes).toBe(canonicalPublicRoutes);
    expect(legacyHealthRoutes).toBe(canonicalHealthRoutes);
    expect(LegacyDashboardService).toBe(CanonicalDashboardService);
    expect(LegacyAnalyticsService).toBe(CanonicalAnalyticsService);
    expect(LegacyAnnouncementService).toBe(CanonicalAnnouncementService);
    expect(LegacyTerminalLogService).toBe(CanonicalTerminalLogService);
    expect(legacySession.adminSessionMiddleware).toBe(canonicalSession.adminSessionMiddleware);
    expect(legacySession.createAdminSession).toBe(canonicalSession.createAdminSession);
  });

  it('keeps Operations application free of db/schema and canonical module free of old Facades', async () => {
    const root = join(process.cwd(), 'src/modules/operations');
    const files = await listTypeScriptFiles(root);
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (file.includes('/application/')) {
        expect(source).not.toMatch(/from ['"][^'"]*(?:\/db|db\/schema)/);
        expect(source).not.toContain('schema.');
      }
      expect(source).not.toMatch(/from ['"][^'"]*\/(?:routes|services)\//);
      expect(source).not.toMatch(/from ['"][^'"]*\/middleware\/admin-session\.middleware/);
    }
  });
});
