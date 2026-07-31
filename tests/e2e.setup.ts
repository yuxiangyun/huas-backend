/**
 * [INPUT]: 依赖真实 E2E 凭据、临时目录、Bun SQLite 与显式 migration
 * [OUTPUT]: 为真实上游测试提供隔离的已迁移数据库和运行时环境
 * [POS]: tests 的 E2E preload 边界，禁止真实上游验证接触生产 SQLite
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Database } from 'bun:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateDatabase } from '../src/db/migrator';

const username = process.env.HUAS_E2E_USERNAME;
const password = process.env.HUAS_E2E_PASSWORD;

if (!username || !password) {
  throw new Error(
    'Missing HUAS_E2E_USERNAME/HUAS_E2E_PASSWORD. ' +
    'Set them before running: bun run test:e2e'
  );
}

const root = mkdtempSync(join(tmpdir(), 'huas-server-e2e-'));
const dbPath = join(root, 'e2e.db');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DB_PATH = dbPath;
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.TIMEZONE = 'Asia/Shanghai';
process.env.TZ = 'Asia/Shanghai';
process.env.GRADES_CACHE_LIMIT = process.env.GRADES_CACHE_LIMIT || '20';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'huas-e2e-test-secret-32chars-min';

const database = new Database(dbPath);
try {
  database.exec('PRAGMA foreign_keys = ON');
  migrateDatabase(database, { allowDestructive: true });
} finally {
  database.close();
}

(globalThis as any).__HUAS_E2E_ROOT__ = root;
