/**
 * [INPUT]: 依赖显式 --db 参数、Bun SQLite 与 src/db/migrator
 * [OUTPUT]: 对外提供可重复执行的数据库前向迁移命令
 * [POS]: scripts 的结构发布入口，供人工运维与发布前检查调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrateDatabase } from '../src/db/migrator';

const args = process.argv.slice(2);
const dbIndex = args.indexOf('--db');
if (dbIndex < 0 || !args[dbIndex + 1]) {
  console.error('Usage: bun run db:migrate -- --db <sqlite-path>');
  process.exit(2);
}

const dbPath = resolve(args[dbIndex + 1]);
mkdirSync(dirname(dbPath), { recursive: true });
const database = new Database(dbPath);
try {
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  const result = migrateDatabase(database);
  console.log(`Database migration complete: version=${result.version} applied=${result.applied.join(',') || 'none'} adopted=${result.adopted}`);
} finally {
  database.close();
}
