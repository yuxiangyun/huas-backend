/**
 * [INPUT]: 依赖显式 --db 参数、可选 --dry-run、Bun SQLite、只读 schema 校验与 src/db/repair
 * [OUTPUT]: 对外提供 Discover/Treehole 派生计数的幂等检查与修复命令
 * [POS]: scripts 的显式数据维护入口，替代普通启动中的全表计数修复
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertDatabaseSchemaCurrent } from '../src/db/migrator';
import { repairDerivedCounts } from '../src/db/repair';

const args = process.argv.slice(2);
const dbIndex = args.indexOf('--db');
if (dbIndex < 0 || !args[dbIndex + 1]) {
  console.error('Usage: bun run db:repair -- --db <sqlite-path> [--dry-run]');
  process.exit(2);
}

const dbPath = resolve(args[dbIndex + 1]);
if (!existsSync(dbPath)) throw new Error(`SQLite database does not exist: ${dbPath}`);
const database = new Database(dbPath);
try {
  database.exec('PRAGMA foreign_keys = ON');
  assertDatabaseSchemaCurrent(database);
  const result = repairDerivedCounts(database, { dryRun: args.includes('--dry-run') });
  console.log(`Database repair ${result.dryRun ? 'dry-run' : 'complete'}: discover_posts=${result.discoverPosts} treehole_posts=${result.treeholePosts}`);
} finally {
  database.close();
}
