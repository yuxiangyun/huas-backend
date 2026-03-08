import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { sql } from 'drizzle-orm';

let db: ReturnType<typeof drizzle<typeof schema>>;
let sqliteDb: Database;

function getTableColumns(table: 'users' | 'credentials' | 'cache'): Set<string> {
  const rows = sqliteDb.query(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return new Set(rows.map((row) => String(row.name || '')));
}

function ensureColumn(
  table: 'users' | 'credentials' | 'cache',
  column: string,
  definition: string
): void {
  const columns = getTableColumns(table);
  if (columns.has(column)) return;

  sqliteDb.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  Logger.server(`数据库迁移: 补齐 ${table}.${column}`);
}

function ensureLegacyColumns(): void {
  ensureColumn('users', 'encrypted_password', 'encrypted_password TEXT');
  ensureColumn('users', 'created_at', 'created_at INTEGER');
  ensureColumn('users', 'last_login_at', 'last_login_at INTEGER');

  ensureColumn('credentials', 'value', 'value TEXT');
  ensureColumn('credentials', 'cookie_jar', 'cookie_jar TEXT');
  ensureColumn('credentials', 'expires_at', 'expires_at INTEGER');
  ensureColumn('credentials', 'created_at', 'created_at INTEGER');
  ensureColumn('credentials', 'updated_at', 'updated_at INTEGER');

  ensureColumn('cache', 'source', 'source TEXT');
  ensureColumn('cache', 'created_at', 'created_at INTEGER');
  ensureColumn('cache', 'updated_at', 'updated_at INTEGER');
  ensureColumn('cache', 'expires_at', 'expires_at INTEGER');
}

function backfillCriticalTimestamps(): void {
  const now = Date.now();

  sqliteDb.exec(`UPDATE users SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`);
  sqliteDb.exec(`UPDATE users SET last_login_at = ${now} WHERE last_login_at IS NULL OR last_login_at <= 0`);
  sqliteDb.exec(`UPDATE credentials SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`);
  sqliteDb.exec(`UPDATE credentials SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`);
  sqliteDb.exec(`UPDATE cache SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`);
  sqliteDb.exec(`UPDATE cache SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`);
}

export function getDb() {
  if (!db) {
    // Ensure parent directory exists
    mkdirSync(dirname(config.dbPath), { recursive: true });
    const sqlite = new Database(config.dbPath);
    sqlite.exec('PRAGMA journal_mode = WAL');
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec('PRAGMA busy_timeout = 5000');
    sqliteDb = sqlite;
    db = drizzle(sqlite, { schema });
  }
  return db;
}

export function initDatabase() {
  const database = getDb();

  // Create tables if not exist
  database.run(sql`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL UNIQUE,
    name TEXT,
    class_name TEXT,
    encrypted_password TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    last_login_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);

  database.run(sql`CREATE TABLE IF NOT EXISTS credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    system TEXT NOT NULL,
    value TEXT,
    cookie_jar TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);

  database.run(sql`CREATE TABLE IF NOT EXISTS cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    source TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    expires_at INTEGER
  )`);

  // Backward-compatible migration for older SQLite files.
  ensureLegacyColumns();
  backfillCriticalTimestamps();

  // Create indexes (migrate: drop old non-unique index, create unique one)
  database.run(sql`DROP INDEX IF EXISTS idx_credentials_user_system`);
  // Clean up duplicates before adding unique constraint (keep newest)
  database.run(sql`DELETE FROM credentials WHERE id NOT IN (
    SELECT MAX(id) FROM credentials GROUP BY user_id, system
  )`);
  database.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_user_system ON credentials(user_id, system)`);
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_cache_key ON cache(key)`);
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at)`);

  Logger.server('数据库初始化完成');
}

export { schema };
