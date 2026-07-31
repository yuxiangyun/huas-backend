/**
 * [INPUT]: 依赖 node:fs/os/path 创建隔离的测试数据目录，并写入测试运行时环境变量
 * [OUTPUT]: 为 Bun 测试预加载数据库、密钥、管理凭据与媒体配置，进程退出时清理临时目录
 * [POS]: tests 的全局运行时边界，保证测试不读写生产数据或生产凭据
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { migrateDatabase } from '../src/db/migrator';

const testRoot = mkdtempSync(join(tmpdir(), 'huas-server-test-'));
const testDbPath = join(testRoot, 'test.db');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.JWT_SECRET = 'unit-test-secret-key-32chars-minimum';
process.env.DB_PATH = testDbPath;
process.env.CALENDAR_BASE_URL = 'https://calendar.example.test';
process.env.CALENDAR_SECRET = 'unit-test-calendar-secret';
process.env.LOG_LEVEL = 'error';
process.env.TIMEZONE = 'Asia/Shanghai';
process.env.TZ = 'Asia/Shanghai';
process.env.GRADES_CACHE_LIMIT = '20';
process.env.SCHEDULE_CACHE_LIMIT = '60';
process.env.PORTAL_SCHEDULE_CACHE_LIMIT = '60';
process.env.CLASSROOM_ADMIN_STUDENT_ID = '202412040130';
process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.DISCOVER_IMAGE_MAX_BYTES = '33554432';
process.env.COMMUNITY_AVATAR_STORAGE_ROOT = join(testRoot, 'treehole-avatars');
process.env.COMMUNITY_AVATAR_MEDIA_BASE_PATH = '/media/treehole-avatar';
process.env.COMMUNITY_AVATAR_MAX_BYTES = '2097152';
process.env.COMMUNITY_AVATAR_MAX_DIMENSION = '512';
process.env.COMMUNITY_AVATAR_QUALITY = '78';

const testDatabase = new Database(testDbPath);
try {
  testDatabase.exec('PRAGMA foreign_keys = ON');
  migrateDatabase(testDatabase, { allowDestructive: true });
} finally {
  testDatabase.close();
}

(globalThis as any).__HUAS_TEST_ROOT__ = testRoot;

process.once('exit', () => {
  rmSync(testRoot, { recursive: true, force: true });
});
