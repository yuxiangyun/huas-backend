/**
 * [INPUT]: 依赖 Bun SQLite、Drizzle、schema 表定义、config.dbPath 与 migrator 的只读校验
 * [OUTPUT]: 对外提供 getDb()、assertConfiguredDatabaseSchemaCurrent()、closeDatabase() 与 schema 再导出
 * [POS]: db 的运行期连接入口，只打开显式迁移后的数据库；结构演进权仅属于 scripts/db-migrate.ts
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import * as schema from './schema';
import { config } from '../config';
import { assertDatabaseSchemaCurrent } from './migrator';

let db: ReturnType<typeof drizzle<typeof schema>> | undefined;
let sqliteDb: Database | undefined;

export function getDb() {
  if (!db) {
    if (config.dbPath !== ':memory:' && !existsSync(config.dbPath)) {
      throw new Error(
        `SQLite database does not exist: ${config.dbPath}. `
        + 'Run the explicit db:migrate command before starting the application.',
      );
    }
    sqliteDb = config.dbPath === ':memory:'
      ? new Database(config.dbPath)
      : new Database(config.dbPath, { create: false, readwrite: true });
    sqliteDb.exec('PRAGMA journal_mode = WAL');
    sqliteDb.exec('PRAGMA foreign_keys = ON');
    sqliteDb.exec('PRAGMA busy_timeout = 5000');
    db = drizzle(sqliteDb, { schema });
  }
  return db;
}

export function assertConfiguredDatabaseSchemaCurrent(): void {
  getDb();
  assertDatabaseSchemaCurrent(sqliteDb!);
}

export function closeDatabase(): void {
  sqliteDb?.close();
  sqliteDb = undefined;
  db = undefined;
}

export { schema };
