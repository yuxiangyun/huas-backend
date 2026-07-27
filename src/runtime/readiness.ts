/**
 * [INPUT]: 依赖 serverState、Drizzle SQLite 查询、migration 注册表与 runtimeMetrics
 * [OUTPUT]: 对外提供 createReadinessProbe、readinessProbe 与结构化进程/SQLite/migration 检查结果
 * [POS]: runtime 的就绪判定器，只检查本地依赖，不探测 CAS、Portal 或 JW 校园上游
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { MIGRATIONS } from '../db/migrations';
import { serverState } from './server-state';
import { runtimeMetrics } from './runtime-metrics';

export interface ReadinessDependencies {
  processStatus(): {
    ready: boolean;
    shuttingDown: boolean;
    shutdownSignal: string | null;
    deploySlot: string;
  };
  probeSqlite(): void;
  currentMigrationVersion(): number;
  expectedMigrationVersion: number;
}

export function createReadinessProbe(dependencies: ReadinessDependencies) {
  return {
    check() {
      const process = dependencies.processStatus();
      const processOk = process.ready && !process.shuttingDown;
      let sqliteOk = false;
      let migrationVersion: number | null = null;
      let sqliteError: string | undefined;
      let migrationError: string | undefined;

      try {
        dependencies.probeSqlite();
        sqliteOk = true;
      } catch (error) {
        runtimeMetrics.recordSqliteBusyError(error);
        sqliteError = error instanceof Error ? error.message : String(error);
      }

      if (sqliteOk) {
        try {
          migrationVersion = dependencies.currentMigrationVersion();
        } catch (error) {
          runtimeMetrics.recordSqliteBusyError(error);
          migrationError = error instanceof Error ? error.message : String(error);
        }
      }

      const migrationOk = sqliteOk && migrationVersion === dependencies.expectedMigrationVersion;
      const ready = processOk && sqliteOk && migrationOk;
      return {
        ready,
        status: ready ? 'ready' as const : 'not-ready' as const,
        deploySlot: process.deploySlot,
        checks: {
          process: {
            ok: processOk,
            state: process.shuttingDown ? 'shutting-down' : process.ready ? 'ready' : 'starting',
            shutdownSignal: process.shutdownSignal,
          },
          sqlite: { ok: sqliteOk, ...(sqliteError ? { error: sqliteError } : {}) },
          migration: {
            ok: migrationOk,
            currentVersion: migrationVersion,
            expectedVersion: dependencies.expectedMigrationVersion,
            ...(migrationError ? { error: migrationError } : {}),
          },
        },
      };
    },
  };
}

const expectedMigrationVersion = MIGRATIONS.at(-1)?.version ?? 0;

export const readinessProbe = createReadinessProbe({
  processStatus: () => serverState.status(),
  probeSqlite: () => {
    getDb().run(sql`SELECT 1`);
  },
  currentMigrationVersion: () => {
    const rows = getDb().all<{ version: number }>(
      sql`SELECT COALESCE(MAX(version), 0) AS version FROM huas_schema_migrations`,
    );
    return Number(rows[0]?.version ?? 0);
  },
  expectedMigrationVersion,
});
