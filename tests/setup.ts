import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testRoot = mkdtempSync(join(tmpdir(), 'huas-server-test-'));
const testDbPath = join(testRoot, 'test.db');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.JWT_SECRET = 'unit-test-secret-key-32chars-minimum';
process.env.DB_PATH = testDbPath;
process.env.LOG_LEVEL = 'error';
process.env.TIMEZONE = 'Asia/Shanghai';
process.env.TZ = 'Asia/Shanghai';
process.env.GRADES_CACHE_LIMIT = '20';
process.env.SCHEDULE_CACHE_LIMIT = '60';
process.env.PORTAL_SCHEDULE_CACHE_LIMIT = '60';

(globalThis as any).__HUAS_TEST_ROOT__ = testRoot;
