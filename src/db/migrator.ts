/**
 * [INPUT]: 依赖 Bun SQLite 事务、Node SHA-256 与 migrations 编号注册表
 * [OUTPUT]: 对外提供事务化 migrateDatabase、schema 指纹与当前版本查询
 * [POS]: db 的结构演进内核，以严格 fingerprint 控制 baseline adoption 并对漂移 fail closed
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { MIGRATIONS, type Migration } from './migrations';

const MIGRATION_TABLE = 'huas_schema_migrations';

interface SchemaObject {
  type: string;
  name: string;
  tableName: string;
  sql: string;
}

interface MigrationRow {
  version: number;
  name: string;
  checksum: string;
}

export interface MigrationResult {
  version: number;
  applied: number[];
  adopted: boolean;
}

export interface MigrationOptions {
  migrations?: readonly Migration[];
  afterExecute?: (migration: Migration) => void;
}

function checksum(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeSql(value: string | null): string {
  return String(value ?? '')
    .replace(/\bIF\s+NOT\s+EXISTS\b/gi, '')
    .replace(/["`\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim()
    .toLowerCase();
}

function schemaObjects(database: Database): SchemaObject[] {
  const rows = database.query(`
    SELECT type, name, tbl_name AS tableName, sql
    FROM sqlite_master
    WHERE type IN ('table', 'index')
      AND name NOT LIKE 'sqlite_%'
      AND name <> ?
    ORDER BY type, name
  `).all(MIGRATION_TABLE) as Array<{
    type: string;
    name: string;
    tableName: string;
    sql: string | null;
  }>;

  return rows.map((row) => ({
    type: row.type,
    name: row.name,
    tableName: row.tableName,
    sql: normalizeSql(row.sql),
  }));
}

function expectedObjects(migrations: readonly Migration[]): SchemaObject[] {
  const reference = new Database(':memory:');
  try {
    reference.exec('PRAGMA foreign_keys = ON');
    for (const migration of migrations) reference.exec(migration.sql);
    return schemaObjects(reference);
  } finally {
    reference.close();
  }
}

export function getSchemaFingerprint(database: Database): string {
  return checksum(JSON.stringify(schemaObjects(database)));
}

function assertSchemaMatches(database: Database, migrations: readonly Migration[]): void {
  const actual = schemaObjects(database);
  const expected = expectedObjects(migrations);
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;

  const actualByName = new Map(actual.map((item) => [`${item.type}:${item.name}`, item]));
  const expectedByName = new Map(expected.map((item) => [`${item.type}:${item.name}`, item]));
  const missing = [...expectedByName.keys()].filter((key) => !actualByName.has(key));
  const unexpected = [...actualByName.keys()].filter((key) => !expectedByName.has(key));
  const changed = [...expectedByName.keys()].filter((key) => {
    const actualItem = actualByName.get(key);
    return actualItem && JSON.stringify(actualItem) !== JSON.stringify(expectedByName.get(key));
  });

  throw new Error([
    'SQLite schema fingerprint mismatch; refusing baseline adoption or migration.',
    `Expected fingerprint: ${checksum(JSON.stringify(expected))}`,
    `Actual fingerprint: ${checksum(JSON.stringify(actual))}`,
    `Missing objects: ${missing.join(', ') || 'none'}`,
    `Unexpected objects: ${unexpected.join(', ') || 'none'}`,
    `Changed objects: ${changed.join(', ') || 'none'}`,
    'Diagnostic: run `sqlite3 <DB_PATH> ".schema"` and compare it with `src/db/migrations/0001_baseline.ts`; snapshot the database before correcting drift.',
  ].join('\n'));
}

function createMigrationTable(database: Database): void {
  database.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    adopted INTEGER NOT NULL DEFAULT 0,
    applied_at INTEGER NOT NULL
  )`);
}

function migrationTableExists(database: Database): boolean {
  const row = database.query(
    `SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?`
  ).get(MIGRATION_TABLE) as { count: number };
  return Number(row.count) === 1;
}

export function getCurrentSchemaVersion(database: Database): number {
  if (!migrationTableExists(database)) return 0;
  const row = database.query(`SELECT COALESCE(MAX(version), 0) AS version FROM ${MIGRATION_TABLE}`).get() as {
    version: number;
  };
  return Number(row.version);
}

export function migrateDatabase(database: Database, options: MigrationOptions = {}): MigrationResult {
  const migrations = [...(options.migrations ?? MIGRATIONS)].sort((a, b) => a.version - b.version);
  if (new Set(migrations.map((item) => item.version)).size !== migrations.length) {
    throw new Error('Duplicate database migration version detected.');
  }

  const hadMigrationTable = migrationTableExists(database);
  const appliedRows = hadMigrationTable
    ? database.query(`SELECT version, name, checksum FROM ${MIGRATION_TABLE} ORDER BY version`).all() as MigrationRow[]
    : [];
  const appliedVersions = new Set(appliedRows.map((row) => Number(row.version)));
  let adopted = false;

  for (const row of appliedRows) {
    const migration = migrations.find((item) => item.version === Number(row.version));
    if (!migration) {
      throw new Error(`Database schema version ${row.version} is newer than this release; deploy a compatible release.`);
    }
    if (row.name !== migration.name || row.checksum !== checksum(migration.sql)) {
      throw new Error(`Migration ${row.version} metadata mismatch; published migrations are immutable.`);
    }
  }

  if (appliedRows.length === 0 && schemaObjects(database).length > 0) {
    const baseline = migrations[0];
    if (!baseline) throw new Error('Cannot adopt a non-empty database without a baseline migration.');
    assertSchemaMatches(database, [baseline]);
    createMigrationTable(database);
    const adopt = database.transaction(() => {
      database.query(
        `INSERT INTO ${MIGRATION_TABLE} (version, name, checksum, adopted, applied_at) VALUES (?, ?, ?, 1, ?)`
      ).run(baseline.version, baseline.name, checksum(baseline.sql), Date.now());
    });
    adopt.immediate();
    appliedVersions.add(baseline.version);
    adopted = true;
  } else if (!hadMigrationTable) {
    createMigrationTable(database);
  }

  if (appliedRows.length > 0) {
    const appliedMigrations = migrations.filter((item) => appliedVersions.has(item.version));
    assertSchemaMatches(database, appliedMigrations);
  }

  const applied: number[] = [];
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    const apply = database.transaction(() => {
      database.exec(migration.sql);
      options.afterExecute?.(migration);
      database.query(
        `INSERT INTO ${MIGRATION_TABLE} (version, name, checksum, adopted, applied_at) VALUES (?, ?, ?, 0, ?)`
      ).run(migration.version, migration.name, checksum(migration.sql), Date.now());
    });
    apply.immediate();
    applied.push(migration.version);
  }

  assertSchemaMatches(database, migrations);
  return { version: migrations.at(-1)?.version ?? 0, applied, adopted };
}
