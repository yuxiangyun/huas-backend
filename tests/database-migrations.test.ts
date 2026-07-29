/**
 * [INPUT]: 依赖 Bun SQLite、临时目录与 db migration/repair/snapshot 内核
 * [OUTPUT]: 覆盖空库、baseline adoption、漂移拒绝、中断恢复、幂等 repair 与部署快照边界
 * [POS]: tests 的数据库现代化定向回归，验证结构演进 fail closed 且不改变旧应用业务表读法
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateDatabase, getCurrentSchemaVersion } from '../src/db/migrator';
import { baselineSql } from '../src/db/migrations/0001_baseline';
import { repairDerivedCounts } from '../src/db/repair';
import { createDatabaseSnapshot } from '../src/db/snapshot';

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'huas-db-migration-'));
  roots.push(root);
  return root;
}

function openMemory(): Database {
  const database = new Database(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  return database;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('database migrations', () => {
  test('initializes an empty database and records its version', () => {
    const database = openMemory();
    const result = migrateDatabase(database);
    expect(result).toEqual({ version: 2, applied: [1, 2], adopted: false });
    expect(getCurrentSchemaVersion(database)).toBe(2);
    expect((database.query("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='users'").get() as any).count).toBe(1);
    expect((database.query("SELECT count(*) AS count FROM pragma_table_info('users') WHERE name='community_nickname'").get() as any).count).toBe(1);
    database.close();
  });

  test('adopts a current unversioned schema only after fingerprint match', () => {
    const database = openMemory();
    database.exec(baselineSql.replaceAll('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ').replaceAll('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ').replaceAll('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS '));
    const result = migrateDatabase(database);
    expect(result).toEqual({ version: 2, applied: [2], adopted: true });
    expect(getCurrentSchemaVersion(database)).toBe(2);
    database.close();
  });

  test('adopts only the baseline before applying later numbered migrations', () => {
    const database = openMemory();
    database.exec(baselineSql);
    const migrations = [
      { version: 1, name: 'baseline', sql: baselineSql },
      { version: 2, name: 'expand_only', sql: 'CREATE TABLE future_compatible (id INTEGER PRIMARY KEY);' },
    ];
    expect(migrateDatabase(database, { migrations })).toEqual({ version: 2, applied: [2], adopted: true });
    const rows = database.query('SELECT version, adopted FROM huas_schema_migrations ORDER BY version').all();
    expect(rows).toEqual([{ version: 1, adopted: 1 }, { version: 2, adopted: 0 }]);
    database.close();
  });

  test('is repeatable without applying a migration twice', () => {
    const database = openMemory();
    migrateDatabase(database);
    expect(migrateDatabase(database)).toEqual({ version: 2, applied: [], adopted: false });
    const row = database.query('SELECT count(*) AS count FROM huas_schema_migrations').get() as { count: number };
    expect(row.count).toBe(2);
    database.close();
  });

  test('fails closed on a mismatched fingerprint with executable diagnostics', () => {
    const database = openMemory();
    database.exec(baselineSql);
    database.exec('ALTER TABLE users ADD COLUMN drifted TEXT');
    expect(() => migrateDatabase(database)).toThrow(/schema fingerprint mismatch/);
    expect(() => migrateDatabase(database)).toThrow(/sqlite3 <DB_PATH> "\.schema"/);
    expect(getCurrentSchemaVersion(database)).toBe(0);
    expect((database.query("SELECT count(*) AS count FROM sqlite_master WHERE name='huas_schema_migrations'").get() as any).count).toBe(0);
    database.close();
  });

  test('recovers from an interrupted migration transaction', () => {
    const database = openMemory();
    const migrations = [
      { version: 1, name: 'first', sql: 'CREATE TABLE first_table (id INTEGER PRIMARY KEY);' },
      { version: 2, name: 'second', sql: 'CREATE TABLE second_table (id INTEGER PRIMARY KEY);' },
    ];
    expect(() => migrateDatabase(database, {
      migrations,
      afterExecute: (migration) => {
        if (migration.version === 2) throw new Error('simulated interruption');
      },
    })).toThrow('simulated interruption');
    expect(getCurrentSchemaVersion(database)).toBe(1);
    expect((database.query("SELECT count(*) AS count FROM sqlite_master WHERE name='second_table'").get() as any).count).toBe(0);
    expect(migrateDatabase(database, { migrations }).version).toBe(2);
    database.close();
  });

  test('keeps the business schema readable by the previous application version', () => {
    const database = openMemory();
    migrateDatabase(database);
    database.query('INSERT INTO users (student_id, name) VALUES (?, ?)').run('previous-app', '兼容用户');
    const row = database.query('SELECT student_id, name, last_active_at FROM users WHERE student_id = ?').get('previous-app') as any;
    expect(row.student_id).toBe('previous-app');
    expect(Number(row.last_active_at)).toBeGreaterThan(0);
    database.close();
  });

  test('keeps full-table derived-count repair out of ordinary initialization', () => {
    const source = readFileSync(join(process.cwd(), 'src/db/index.ts'), 'utf8');
    expect(source).not.toContain('SET comment_count =');
    expect(source).not.toContain('SET like_count =');
    expect(source).toContain('DEPRECATED: initDatabase()');
  });
});

describe('database repair', () => {
  function databaseWithDrift(): Database {
    const database = openMemory();
    migrateDatabase(database);
    database.query('INSERT INTO users (student_id) VALUES (?)').run('repair-user');
    database.exec(`
      INSERT INTO discover_posts (user_id, category, storage_key, images_json, tags_json, cover_url, comment_count, rating_count, rating_sum, rating_avg)
      VALUES (1, '其他', 'repair', '[]', '[]', '', 99, 99, 99, 99);
      INSERT INTO discover_comments (post_id, user_id, content) VALUES (1, 1, 'visible');
      INSERT INTO discover_post_ratings (post_id, user_id, score) VALUES (1, 1, 4);
      INSERT INTO treehole_posts (user_id, content, like_count, comment_count) VALUES (1, 'repair', 99, 99);
      INSERT INTO treehole_post_likes (post_id, user_id) VALUES (1, 1);
      INSERT INTO treehole_comments (post_id, user_id, content) VALUES (1, 1, 'visible');
    `);
    return database;
  }

  test('dry-run reports drift without writing rows', () => {
    const database = databaseWithDrift();
    expect(repairDerivedCounts(database, { dryRun: true })).toEqual({ dryRun: true, discoverPosts: 1, treeholePosts: 1 });
    expect((database.query('SELECT comment_count FROM discover_posts').get() as any).comment_count).toBe(99);
    database.close();
  });

  test('repairs derived counts idempotently', () => {
    const database = databaseWithDrift();
    expect(repairDerivedCounts(database)).toEqual({ dryRun: false, discoverPosts: 1, treeholePosts: 1 });
    expect(repairDerivedCounts(database)).toEqual({ dryRun: false, discoverPosts: 0, treeholePosts: 0 });
    expect(database.query('SELECT comment_count, rating_count, rating_sum, rating_avg FROM discover_posts').get()).toEqual({
      comment_count: 1,
      rating_count: 1,
      rating_sum: 4,
      rating_avg: 4,
    });
    expect(database.query('SELECT like_count, comment_count FROM treehole_posts').get()).toEqual({ like_count: 1, comment_count: 1 });
    database.close();
  });
});

describe('database snapshots', () => {
  test('creates a named, readable SQLite copy with release and schema version', () => {
    const root = temporaryRoot();
    const dbPath = join(root, 'source.db');
    const database = new Database(dbPath);
    migrateDatabase(database);
    database.query('INSERT INTO users (student_id) VALUES (?)').run('snapshot-user');
    database.close();

    const snapshot = createDatabaseSnapshot({
      dbPath,
      release: 'release/phase-1',
      now: new Date('2026-07-27T01:02:03.000Z'),
    });
    expect(snapshot).toEndWith('source-20260727T010203Z-schema-v2-release-release-phase-1.db');
    const copy = new Database(snapshot, { readonly: true });
    expect((copy.query('SELECT count(*) AS count FROM users').get() as any).count).toBe(1);
    copy.close();
  });

  test('throws on snapshot failure and deploy scripts order snapshot before migration/start', () => {
    const root = temporaryRoot();
    expect(() => createDatabaseSnapshot({ dbPath: join(root, 'missing.db'), release: 'failure' })).toThrow(/does not exist/);
    for (const script of ['scripts/deploy-huas.sh', 'scripts/remote-blue-green-deploy.sh']) {
      const source = readFileSync(join(process.cwd(), script), 'utf8');
      const snapshotCall = script.endsWith('deploy-huas.sh')
        ? source.lastIndexOf('bun run db:snapshot')
        : source.lastIndexOf('snapshot_database "$RELEASE_SOURCE_DIR"');
      const migrationCall = script.endsWith('deploy-huas.sh')
        ? source.lastIndexOf('bun run db:migrate')
        : source.lastIndexOf('migrate_database "$RELEASE_SOURCE_DIR"');
      expect(snapshotCall).toBeGreaterThan(-1);
      expect(snapshotCall).toBeLessThan(migrationCall);
      const startCall = script.endsWith('deploy-huas.sh')
        ? source.lastIndexOf('pm2 startOrReload')
        : source.lastIndexOf('ensure_pm2_app "$target_slot"');
      expect(snapshotCall).toBeLessThan(startCall);
    }
  });
});
