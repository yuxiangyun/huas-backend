import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
process.env.TREEHOLE_AVATAR_STORAGE_ROOT = join(testRoot, 'treehole-avatars');
process.env.TREEHOLE_AVATAR_MEDIA_BASE_PATH = '/media/treehole-avatar';
process.env.TREEHOLE_AVATAR_MAX_BYTES = '2097152';

(globalThis as any).__HUAS_TEST_ROOT__ = testRoot;

process.once('exit', () => {
  rmSync(testRoot, { recursive: true, force: true });
});
