import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

(globalThis as any).__HUAS_E2E_ROOT__ = root;
