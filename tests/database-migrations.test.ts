/**
 * [INPUT]: 依赖 Bun SQLite/子进程、临时目录与 db migration CLI/repair/snapshot/只读校验内核
 * [OUTPUT]: 覆盖 destructive CLI 授权、0003 行数与业务值守恒、SQLite 完整性、旧事实拒绝、schema fail-closed、repair 与快照边界
 * [POS]: tests 的数据库 contract migration 回归，证明破坏性发布必须显式且运行期没有结构变更权
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertDatabaseSchemaCurrent,
  getCurrentSchemaVersion,
  migrateDatabase,
} from '../src/db/migrator';
import { baselineSql } from '../src/db/migrations/0001_baseline';
import { MIGRATIONS } from '../src/db/migrations';
import { repairDerivedCounts } from '../src/db/repair';
import { createDatabaseSnapshot } from '../src/db/snapshot';

const roots: string[] = [];
const LEGACY_MIGRATIONS = MIGRATIONS.slice(0, 2);
const CORE_TABLES = [
  'users',
  'credentials',
  'cache',
  'discover_posts',
  'discover_comments',
  'treehole_posts',
  'treehole_comments',
  'treehole_post_likes',
] as const;

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

function migrateLegacy(database: Database): void {
  migrateDatabase(database, { migrations: LEGACY_MIGRATIONS });
}

function seedLegacySocialFacts(database: Database): void {
  database.exec(`
    INSERT INTO users (student_id, name, class_name, treehole_avatar_url, community_nickname)
    VALUES ('u-1', '甲', '软工24101班', '/media/treehole-avatar/1.webp?v=7', '山茶'),
           ('u-2', '乙', '计科24201班', NULL, NULL);
    INSERT INTO credentials (user_id, system, value) VALUES (1, 'tgc', 'opaque');
    INSERT INTO cache (key, data, source) VALUES ('schedule:1', '{}', 'jw');
    INSERT INTO discover_posts
      (user_id, title, category, storage_key, images_json, tags_json, cover_url)
    VALUES (1, '保留帖子', '食堂', 'discover-1', '["1.webp"]', '["早餐"]', '/media/discover/1.webp');
    INSERT INTO discover_comments (post_id, user_id, content) VALUES (1, 2, '保留评论');
    INSERT INTO treehole_posts (user_id, content, like_count, comment_count)
    VALUES (2, '保留树洞', 1, 1);
    INSERT INTO treehole_post_likes (post_id, user_id) VALUES (1, 1);
    INSERT INTO treehole_comments (post_id, user_id, content) VALUES (1, 1, '保留回复');
  `);
}

function objectExists(database: Database, name: string): boolean {
  const row = database.query(
    "SELECT count(*) AS count FROM sqlite_master WHERE name = ?",
  ).get(name) as { count: number };
  return Number(row.count) === 1;
}

function count(database: Database, table: string): number {
  return Number((database.query(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);
}

function coreCounts(database: Database): Record<string, number> {
  return Object.fromEntries(CORE_TABLES.map((table) => [table, count(database, table)]));
}

function preservedBusinessFacts(database: Database): Record<string, unknown> {
  return {
    users: database.query(
      'SELECT id, student_id, name, class_name FROM users ORDER BY id',
    ).all(),
    discoverPosts: database.query(`
      SELECT id, user_id, title, category, storage_key, images_json, tags_json, cover_url
      FROM discover_posts ORDER BY id
    `).all(),
    discoverComments: database.query(
      'SELECT id, post_id, user_id, content FROM discover_comments ORDER BY id',
    ).all(),
    treeholePosts: database.query(
      'SELECT id, user_id, content, like_count, comment_count FROM treehole_posts ORDER BY id',
    ).all(),
    treeholeComments: database.query(
      'SELECT id, post_id, user_id, content FROM treehole_comments ORDER BY id',
    ).all(),
    treeholeLikes: database.query(
      'SELECT id, post_id, user_id FROM treehole_post_likes ORDER BY id',
    ).all(),
  };
}

function expectSqliteIntegrity(database: Database): void {
  expect(database.query('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
  expect(database.query('PRAGMA foreign_key_check').all()).toEqual([]);
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('database migrations', () => {
  test('requires explicit destructive authorization before writing an empty database', () => {
    const database = openMemory();
    expect(() => migrateDatabase(database)).toThrow(/allow-destructive/);
    expect(objectExists(database, 'huas_schema_migrations')).toBe(false);
    expect(objectExists(database, 'users')).toBe(false);

    const result = migrateDatabase(database, { allowDestructive: true });
    expect(result).toEqual({ version: 3, applied: [1, 2, 3], adopted: false });
    expect(assertDatabaseSchemaCurrent(database)).toEqual({ version: 3 });
    database.close();
  });

  test('adopts a baseline only with destructive authorization before later versions', () => {
    const database = openMemory();
    database.exec(baselineSql);
    expect(() => migrateDatabase(database)).toThrow(/allow-destructive/);
    expect(getCurrentSchemaVersion(database)).toBe(0);

    const result = migrateDatabase(database, { allowDestructive: true });
    expect(result).toEqual({ version: 3, applied: [2, 3], adopted: true });
    expect(getCurrentSchemaVersion(database)).toBe(3);
    database.close();
  });

  test('is repeatable without requiring the flag after the destructive version is applied', () => {
    const database = openMemory();
    migrateDatabase(database, { allowDestructive: true });
    expect(migrateDatabase(database)).toEqual({ version: 3, applied: [], adopted: false });
    expect(count(database, 'huas_schema_migrations')).toBe(3);
    database.close();
  });

  test('preserves every core v2 fact row and migrates community profile values', () => {
    const database = openMemory();
    migrateLegacy(database);
    seedLegacySocialFacts(database);
    const beforeCounts = coreCounts(database);
    const beforeFacts = preservedBusinessFacts(database);

    expect(() => migrateDatabase(database)).toThrow(/allow-destructive/);
    expect(getCurrentSchemaVersion(database)).toBe(2);
    expect(coreCounts(database)).toEqual(beforeCounts);
    expect(preservedBusinessFacts(database)).toEqual(beforeFacts);

    migrateDatabase(database, { allowDestructive: true });
    expect(coreCounts(database)).toEqual(beforeCounts);
    expect(preservedBusinessFacts(database)).toEqual(beforeFacts);
    expect(database.query(
      'SELECT user_id, nickname, avatar_url FROM community_profiles ORDER BY user_id',
    ).all()).toEqual([
      { user_id: 1, nickname: '山茶', avatar_url: '/media/treehole-avatar/1.webp?v=7' },
      { user_id: 2, nickname: null, avatar_url: null },
    ]);
    expect(database.query('SELECT title, like_count FROM discover_posts').get()).toEqual({
      title: '保留帖子',
      like_count: 0,
    });
    expect(objectExists(database, 'discover_post_ratings')).toBe(false);
    expect(objectExists(database, 'treehole_comment_notifications')).toBe(false);
    expect((database.query(
      "SELECT count(*) AS count FROM pragma_table_info('users') WHERE name IN ('community_nickname', 'treehole_avatar_url')",
    ).get() as { count: number }).count).toBe(0);
    expect(assertDatabaseSchemaCurrent(database)).toEqual({ version: 3 });
    expectSqliteIntegrity(database);
    database.close();
  });

  test('enforces destructive authorization through the file database CLI', () => {
    const dbPath = join(temporaryRoot(), 'v2.db');
    const database = new Database(dbPath);
    database.exec('PRAGMA foreign_keys = ON');
    migrateLegacy(database);
    seedLegacySocialFacts(database);
    const beforeCounts = coreCounts(database);
    const beforeFacts = preservedBusinessFacts(database);
    database.close();

    const denied = Bun.spawnSync([
      process.execPath,
      'scripts/db-migrate.ts',
      '--db',
      dbPath,
    ], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
    expect(denied.exitCode).not.toBe(0);
    expect(denied.stderr.toString()).toMatch(/destructive/);

    const unchanged = new Database(dbPath, { create: false, readwrite: true });
    unchanged.exec('PRAGMA foreign_keys = ON');
    expect(getCurrentSchemaVersion(unchanged)).toBe(2);
    expect(coreCounts(unchanged)).toEqual(beforeCounts);
    expect(preservedBusinessFacts(unchanged)).toEqual(beforeFacts);
    expect(objectExists(unchanged, 'community_profiles')).toBe(false);
    unchanged.close();

    const allowed = Bun.spawnSync([
      process.execPath,
      'scripts/db-migrate.ts',
      '--db',
      dbPath,
      '--allow-destructive',
    ], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
    expect(allowed.exitCode, allowed.stderr.toString()).toBe(0);
    expect(allowed.stdout.toString()).toMatch(/version=3 applied=3 adopted=false/);

    const migrated = new Database(dbPath, { create: false, readwrite: true });
    migrated.exec('PRAGMA foreign_keys = ON');
    expect(getCurrentSchemaVersion(migrated)).toBe(3);
    expect(coreCounts(migrated)).toEqual(beforeCounts);
    expect(preservedBusinessFacts(migrated)).toEqual(beforeFacts);
    expect(count(migrated, 'community_profiles')).toBe(count(migrated, 'users'));
    expectSqliteIntegrity(migrated);
    migrated.close();

    const repeated = Bun.spawnSync([
      process.execPath,
      'scripts/db-migrate.ts',
      '--db',
      dbPath,
    ], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
    expect(repeated.exitCode, repeated.stderr.toString()).toBe(0);
    expect(repeated.stdout.toString()).toMatch(/version=3 applied=none adopted=false/);
  });

  test('refuses to discard a newly appeared legacy rating', () => {
    const database = openMemory();
    migrateLegacy(database);
    database.exec(`
      INSERT INTO users (student_id) VALUES ('rating-user');
      INSERT INTO discover_posts (user_id, category, storage_key, images_json, tags_json, cover_url)
      VALUES (1, '其他', 'rating-post', '[]', '[]', '');
      INSERT INTO discover_post_ratings (post_id, user_id, score) VALUES (1, 1, 5);
    `);
    expect(() => migrateDatabase(database, { allowDestructive: true })).toThrow(/CHECK constraint failed/);
    expect(getCurrentSchemaVersion(database)).toBe(2);
    expect(count(database, 'discover_post_ratings')).toBe(1);
    expect(objectExists(database, 'community_profiles')).toBe(false);
    database.close();
  });

  test('refuses to discard a newly appeared legacy treehole notification', () => {
    const database = openMemory();
    migrateLegacy(database);
    database.exec(`
      INSERT INTO users (student_id) VALUES ('author'), ('recipient');
      INSERT INTO treehole_posts (user_id, content) VALUES (1, 'post');
      INSERT INTO treehole_comments (post_id, user_id, content) VALUES (1, 1, 'comment');
      INSERT INTO treehole_comment_notifications
        (recipient_user_id, actor_user_id, post_id, comment_id, type)
      VALUES (2, 1, 1, 1, 'post_comment');
    `);
    expect(() => migrateDatabase(database, { allowDestructive: true })).toThrow(/CHECK constraint failed/);
    expect(getCurrentSchemaVersion(database)).toBe(2);
    expect(count(database, 'treehole_comment_notifications')).toBe(1);
    database.close();
  });

  test('enforces final social uniqueness, ordering and media metadata constraints', () => {
    const database = openMemory();
    migrateDatabase(database, { allowDestructive: true });
    database.exec("INSERT INTO users (student_id) VALUES ('low'), ('high')");

    expect(() => database.exec(
      'INSERT INTO conversations (user_low_id, user_high_id) VALUES (1, 1)',
    )).toThrow(/CHECK constraint failed/);
    database.exec('INSERT INTO conversations (user_low_id, user_high_id) VALUES (1, 2)');
    expect(() => database.exec(
      'INSERT INTO conversations (user_low_id, user_high_id) VALUES (1, 2)',
    )).toThrow(/UNIQUE constraint failed/);

    expect(() => database.exec(
      "INSERT INTO messages (conversation_id, sender_user_id, client_message_id, text) VALUES (1, 1, '', '非法')",
    )).toThrow(/CHECK constraint failed/);
    const clientMessageId = '11111111-1111-4111-8111-111111111111';
    database.query(
      'INSERT INTO messages (conversation_id, sender_user_id, client_message_id, text) VALUES (1, 1, ?, ?)',
    ).run(clientMessageId, '你好');
    expect(() => database.exec(
      `INSERT INTO messages (conversation_id, sender_user_id, client_message_id, text) VALUES (1, 1, '${clientMessageId}', '重复')`,
    )).toThrow(/UNIQUE constraint failed/);
    expect(() => database.exec(
      "INSERT INTO messages (conversation_id, sender_user_id, client_message_id, text) VALUES (1, 1, '22222222-2222-4222-8222-222222222222', '')",
    )).toThrow(/CHECK constraint failed/);
    database.exec("INSERT INTO message_images (message_id, storage_key, sort_order, width, height, size_bytes, mime_type) VALUES (1, 'm/1.webp', 0, 1280, 720, 1024, 'image/webp')");
    expect(() => database.exec(
      "INSERT INTO message_images (message_id, storage_key, sort_order, width, height, size_bytes, mime_type) VALUES (1, 'm/2.webp', 0, 1, 1, 1, 'image/webp')",
    )).toThrow(/UNIQUE constraint failed/);
    expect(() => database.exec(
      "INSERT INTO message_images (message_id, storage_key, sort_order, width, height, size_bytes, mime_type) VALUES (1, 'm/10.webp', 9, 1, 1, 1, 'image/webp')",
    )).toThrow(/CHECK constraint failed/);
    expect(() => database.exec(
      "INSERT INTO message_images (message_id, storage_key, sort_order, width, height, size_bytes, mime_type) VALUES (1, 'm/2.png', 1, 1, 1, 1, 'image/png')",
    )).toThrow(/CHECK constraint failed/);
    const messagingIndexes = database.query(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'messages' ORDER BY name",
    ).all() as Array<{ name: string }>;
    expect(messagingIndexes.map((row) => row.name)).toContain('idx_messages_sender_created');

    database.exec("INSERT INTO activity_outbox (event_id, recipient_user_id, actor_user_id, type, resource_type, resource_id) VALUES ('event-1', 2, 1, 'discover_like', 'discover_post', 9)");
    expect(() => database.exec(
      "INSERT INTO activity_outbox (event_id, recipient_user_id, actor_user_id, type, resource_type, resource_id) VALUES ('event-1', 2, 1, 'discover_like', 'discover_post', 9)",
    )).toThrow(/UNIQUE constraint failed/);
    database.exec("INSERT INTO notifications (event_id, recipient_user_id, actor_user_id, type, resource_type, resource_id) VALUES ('event-1', 2, 1, 'discover_like', 'discover_post', 9)");
    expect(() => database.exec(
      "INSERT INTO notifications (event_id, recipient_user_id, actor_user_id, type, resource_type, resource_id) VALUES ('event-1', 1, 2, 'discover_like', 'discover_post', 9)",
    )).toThrow(/UNIQUE constraint failed/);
    database.close();
  });

  test('fails closed on migration metadata or schema drift without writing', () => {
    const database = openMemory();
    migrateDatabase(database, { allowDestructive: true });
    const originalChecksum = (database.query(
      'SELECT checksum FROM huas_schema_migrations WHERE version = 2',
    ).get() as { checksum: string }).checksum;
    database.exec("UPDATE huas_schema_migrations SET checksum = 'tampered' WHERE version = 2");
    expect(() => assertDatabaseSchemaCurrent(database)).toThrow(/metadata mismatch/);
    database.query('UPDATE huas_schema_migrations SET checksum = ? WHERE version = 2').run(originalChecksum);
    database.exec('ALTER TABLE users ADD COLUMN drifted TEXT');
    expect(() => assertDatabaseSchemaCurrent(database)).toThrow(/schema fingerprint mismatch/);
    expect(getCurrentSchemaVersion(database)).toBe(3);
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
    expect(objectExists(database, 'second_table')).toBe(false);
    expect(migrateDatabase(database, { migrations }).version).toBe(2);
    database.close();
  });

  test('keeps all migration authority out of the runtime database entry', () => {
    const source = readFileSync(join(process.cwd(), 'src/db/index.ts'), 'utf8');
    expect(source).not.toContain('initDatabase');
    expect(source).not.toContain('migrateDatabase');
    expect(source).not.toContain('backfillCriticalTimestamps');
    expect(source).toContain('assertConfiguredDatabaseSchemaCurrent');
  });

  test('a v2 database makes the server fail before ready instead of self-migrating', async () => {
    const root = temporaryRoot();
    const dbPath = join(root, 'v2.db');
    const database = new Database(dbPath);
    migrateLegacy(database);
    database.close();

    const child = Bun.spawn([process.execPath, 'run', 'src/index.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DB_PATH: dbPath,
        PORT: '0',
        NODE_ENV: 'production',
        LOG_LEVEL: 'error',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdoutPromise = new Response(child.stdout).text();
    const stderrPromise = new Response(child.stderr).text();
    const outcome = await Promise.race([
      child.exited.then((exitCode) => ({ exitCode, timedOut: false })),
      new Promise<{ exitCode: number; timedOut: true }>((resolve) => {
        setTimeout(() => resolve({ exitCode: -1, timedOut: true }), 5_000);
      }),
    ]);
    if (outcome.timedOut) child.kill();
    const output = `${await stdoutPromise}\n${await stderrPromise}`;
    expect(outcome.timedOut).toBe(false);
    expect(outcome.exitCode).not.toBe(0);
    expect(output).toMatch(/schema|migration/i);
    expect(output).not.toMatch(/server ready/i);
  }, 10_000);
});

describe('database repair', () => {
  function databaseWithDrift(): Database {
    const database = openMemory();
    migrateDatabase(database, { allowDestructive: true });
    database.query('INSERT INTO users (student_id) VALUES (?)').run('repair-user');
    database.exec(`
      INSERT INTO discover_posts
        (user_id, category, storage_key, images_json, tags_json, cover_url, comment_count, like_count)
      VALUES (1, '其他', 'repair', '[]', '[]', '', 99, 99);
      INSERT INTO discover_comments (post_id, user_id, content) VALUES (1, 1, 'visible');
      INSERT INTO discover_post_likes (post_id, user_id) VALUES (1, 1);
      INSERT INTO treehole_posts (user_id, content, like_count, comment_count) VALUES (1, 'repair', 99, 99);
      INSERT INTO treehole_post_likes (post_id, user_id) VALUES (1, 1);
      INSERT INTO treehole_comments (post_id, user_id, content) VALUES (1, 1, 'visible');
    `);
    return database;
  }

  test('dry-run reports drift without writing rows', () => {
    const database = databaseWithDrift();
    expect(repairDerivedCounts(database, { dryRun: true })).toEqual({
      dryRun: true,
      discoverPosts: 1,
      treeholePosts: 1,
    });
    expect(database.query('SELECT comment_count, like_count FROM discover_posts').get()).toEqual({
      comment_count: 99,
      like_count: 99,
    });
    database.close();
  });

  test('repairs derived counts idempotently', () => {
    const database = databaseWithDrift();
    expect(repairDerivedCounts(database)).toEqual({ dryRun: false, discoverPosts: 1, treeholePosts: 1 });
    expect(repairDerivedCounts(database)).toEqual({ dryRun: false, discoverPosts: 0, treeholePosts: 0 });
    expect(database.query('SELECT comment_count, like_count FROM discover_posts').get()).toEqual({
      comment_count: 1,
      like_count: 1,
    });
    expect(database.query('SELECT like_count, comment_count FROM treehole_posts').get()).toEqual({
      like_count: 1,
      comment_count: 1,
    });
    database.close();
  });
});

describe('database snapshots', () => {
  test('creates a named, readable SQLite copy with release and schema version', () => {
    const root = temporaryRoot();
    const dbPath = join(root, 'source.db');
    const database = new Database(dbPath);
    migrateDatabase(database, { allowDestructive: true });
    database.query('INSERT INTO users (student_id) VALUES (?)').run('snapshot-user');
    database.close();

    const snapshot = createDatabaseSnapshot({
      dbPath,
      release: 'release/phase-1',
      now: new Date('2026-07-27T01:02:03.000Z'),
    });
    expect(snapshot).toEndWith('source-20260727T010203Z-schema-v3-release-release-phase-1.db');
    const copy = new Database(snapshot, { readonly: true });
    expect(count(copy, 'users')).toBe(1);
    copy.close();
  });

  test('throws on snapshot failure', () => {
    const root = temporaryRoot();
    expect(() => createDatabaseSnapshot({ dbPath: join(root, 'missing.db'), release: 'failure' }))
      .toThrow(/does not exist/);
  });
});
