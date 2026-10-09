/**
 * [INPUT]: 依赖显式 E2E 启用标记与真实凭据、临时目录、Bun SQLite 与显式 migration
 * [OUTPUT]: 在业务模块加载前固定数据库、媒体和策略路径，迁移临时 SQLite；拒绝普通 bun test
 * [POS]: tests 的 E2E preload 安全边界，禁止真实上游验证接触生产持久数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.env.HUAS_E2E_ENABLED !== '1') {
  throw new Error('Live E2E is disabled. Run bun run test:e2e only with explicit authorization.');
}

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
process.once('exit', () => rmSync(root, { recursive: true, force: true }));

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DB_PATH = dbPath;
process.env.SCHEDULE_SOURCE_POLICY_FILE = join(root, 'schedule-source-policy.json');
process.env.DISCOVER_STORAGE_ROOT = join(root, 'discover');
process.env.COMMUNITY_AVATAR_STORAGE_ROOT = join(root, 'treehole-avatars');
process.env.TREEHOLE_STORAGE_ROOT = join(root, 'treehole-post-media');
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.TIMEZONE = 'Asia/Shanghai';
process.env.TZ = 'Asia/Shanghai';
process.env.GRADES_CACHE_LIMIT = process.env.GRADES_CACHE_LIMIT || '20';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'huas-e2e-test-secret-32chars-min';

try {
  // 配置及隔离路径均已固定，然后才加载迁移与业务模块。
  const { migrateDatabase } = await import('../src/db/migrator');
  const database = new Database(dbPath);
  try {
    database.exec('PRAGMA foreign_keys = ON');
    migrateDatabase(database, { allowDestructive: true });
  } finally {
    database.close();
  }
} catch (error) {
  rmSync(root, { recursive: true, force: true });
  throw error;
}

(globalThis as any).__HUAS_E2E_ROOT__ = root;
