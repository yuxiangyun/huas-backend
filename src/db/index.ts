/**
 * [INPUT]: 依赖 Bun SQLite、Drizzle、schema 表定义、config.dbPath、migrator 与 Logger
 * [OUTPUT]: 对外兼容提供 getDb()、initDatabase() 与 schema 再导出
 * [POS]: db 的运行期入口，把连接装配与版本化 migration 串联；旧 init 调用保留一版但不再修复派生计数
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { migrateDatabase } from './migrator';

let db: ReturnType<typeof drizzle<typeof schema>>;
let sqliteDb: Database;

function backfillCriticalTimestamps(): void {
  const now = Date.now();
  const statements = [
    `UPDATE users SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`,
    `UPDATE users SET last_login_at = ${now} WHERE last_login_at IS NULL OR last_login_at <= 0`,
    `UPDATE users SET last_active_at = COALESCE(NULLIF(last_login_at, 0), NULLIF(created_at, 0), ${now}) WHERE last_active_at IS NULL OR last_active_at <= 0`,
    `UPDATE credentials SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`,
    `UPDATE credentials SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`,
    `UPDATE cache SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`,
    `UPDATE cache SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`,
    `UPDATE discover_posts SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`,
    `UPDATE discover_posts SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`,
    `UPDATE discover_posts SET published_at = ${now} WHERE published_at IS NULL OR published_at <= 0`,
    `UPDATE discover_post_ratings SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`,
    `UPDATE discover_post_ratings SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`,
    `UPDATE discover_comments SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`,
    `UPDATE discover_comments SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`,
    `UPDATE treehole_posts SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`,
    `UPDATE treehole_posts SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`,
    `UPDATE treehole_posts SET published_at = ${now} WHERE published_at IS NULL OR published_at <= 0`,
    `UPDATE treehole_post_likes SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`,
    `UPDATE treehole_comments SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`,
    `UPDATE treehole_comments SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`,
    `UPDATE treehole_comment_notifications SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`,
  ];
  const repair = sqliteDb.transaction(() => {
    for (const statement of statements) sqliteDb.exec(statement);
  });
  repair.immediate();
}

export function getDb() {
  if (!db) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    sqliteDb = new Database(config.dbPath);
    sqliteDb.exec('PRAGMA journal_mode = WAL');
    sqliteDb.exec('PRAGMA foreign_keys = ON');
    sqliteDb.exec('PRAGMA busy_timeout = 5000');
    db = drizzle(sqliteDb, { schema });
  }
  return db;
}

/**
 * @deprecated 保留一个版本以兼容既有入口；后续应在部署阶段显式执行 `bun run db:migrate`。
 */
export function initDatabase() {
  getDb();
  const result = migrateDatabase(sqliteDb);

  // 仅保留旧版本的关键时间戳补正；结构补齐已由 migration 接管，派生计数必须显式 db:repair。
  backfillCriticalTimestamps();
  Logger.server('DEPRECATED: initDatabase() 启动期迁移兼容入口仅保留一个版本；请在部署前执行 db:migrate，派生计数修复请执行 db:repair');
  Logger.server(`数据库初始化完成: schema_version=${result.version}`);
}

export { schema };
