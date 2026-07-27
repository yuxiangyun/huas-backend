/**
 * [INPUT]: 依赖 Operations 系统端口、Drizzle db、serverState 与进程运行指标
 * [OUTPUT]: 对外提供 SystemOperations，执行 SQLite SELECT 1 并读取内存、uptime、进程状态
 * [POS]: operations/infrastructure 的轻量健康与遥测 adapter，不访问校园上游
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../../../db';
import { serverState } from '../../../runtime/server-state';
import type { SystemOperationsPort } from '../domain/ports';

function toMB(value: number): number {
  return Math.round((value / 1024 / 1024) * 100) / 100;
}

export class SystemOperations implements SystemOperationsPort {
  databaseIsHealthy() {
    try {
      getDb().run(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }

  snapshot() {
    const memory = process.memoryUsage();
    return {
      databaseStatus: this.databaseIsHealthy() ? 'ok' as const : 'error' as const,
      memory: {
        rssMb: toMB(memory.rss),
        heapUsedMb: toMB(memory.heapUsed),
        heapTotalMb: toMB(memory.heapTotal),
      },
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  healthStatus() {
    return serverState.status();
  }
}
