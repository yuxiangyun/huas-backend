/**
 * [INPUT]: 依赖显式 --db、可选 --allow-destructive 参数、Bun SQLite 与 src/db/migrator
 * [OUTPUT]: 对外提供默认拒绝 contract migration、经明确授权才执行的数据库迁移命令
 * [POS]: scripts 的唯一结构发布入口，破坏性版本必须位于停流量与快照之后
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrateDatabase } from '../src/db/migrator';

const args = process.argv.slice(2);
const dbIndex = args.indexOf('--db');
if (dbIndex < 0 || !args[dbIndex + 1]) {
  console.error('Usage: bun run db:migrate -- --db <sqlite-path> [--allow-destructive]');
  process.exit(2);
}

const dbPath = resolve(args[dbIndex + 1]);
mkdirSync(dirname(dbPath), { recursive: true });
const database = new Database(dbPath);
try {
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  const result = migrateDatabase(database, {
    allowDestructive: args.includes('--allow-destructive'),
  });
  console.log(`Database migration complete: version=${result.version} applied=${result.applied.join(',') || 'none'} adopted=${result.adopted}`);
} finally {
  database.close();
}
