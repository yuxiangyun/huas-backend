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

function getTableColumns(
  table:
    | 'users'
    | 'credentials'
    | 'cache'
    | 'discover_posts'
    | 'discover_post_ratings'
    | 'treehole_posts'
    | 'treehole_post_likes'
    | 'treehole_comments'
): Set<string> {
  const rows = sqliteDb.query(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return new Set(rows.map((row) => String(row.name || '')));
}

function ensureColumn(
  table:
    | 'users'
    | 'credentials'
    | 'cache'
    | 'discover_posts'
    | 'discover_post_ratings'
    | 'treehole_posts'
    | 'treehole_post_likes'
    | 'treehole_comments',
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

  ensureColumn('discover_posts', 'title', 'title TEXT');
  ensureColumn('discover_posts', 'store_name', 'store_name TEXT');
  ensureColumn('discover_posts', 'price_text', 'price_text TEXT');
  ensureColumn('discover_posts', 'content', 'content TEXT');
  ensureColumn('discover_posts', 'category', 'category TEXT NOT NULL DEFAULT \'其他\'');
  ensureColumn('discover_posts', 'storage_key', 'storage_key TEXT NOT NULL DEFAULT \'\'');
  ensureColumn('discover_posts', 'images_json', 'images_json TEXT NOT NULL DEFAULT \'[]\'');
  ensureColumn('discover_posts', 'tags_json', 'tags_json TEXT NOT NULL DEFAULT \'[]\'');
  ensureColumn('discover_posts', 'cover_url', 'cover_url TEXT NOT NULL DEFAULT \'\'');
  ensureColumn('discover_posts', 'image_count', 'image_count INTEGER NOT NULL DEFAULT 0');
  ensureColumn('discover_posts', 'rating_count', 'rating_count INTEGER NOT NULL DEFAULT 0');
  ensureColumn('discover_posts', 'rating_sum', 'rating_sum INTEGER NOT NULL DEFAULT 0');
  ensureColumn('discover_posts', 'rating_avg', 'rating_avg REAL NOT NULL DEFAULT 0');
  ensureColumn('discover_posts', 'created_at', 'created_at INTEGER');
  ensureColumn('discover_posts', 'updated_at', 'updated_at INTEGER');
  ensureColumn('discover_posts', 'published_at', 'published_at INTEGER');
  ensureColumn('discover_posts', 'deleted_at', 'deleted_at INTEGER');

  ensureColumn('discover_post_ratings', 'score', 'score INTEGER NOT NULL DEFAULT 0');
  ensureColumn('discover_post_ratings', 'created_at', 'created_at INTEGER');
  ensureColumn('discover_post_ratings', 'updated_at', 'updated_at INTEGER');

  ensureColumn('treehole_posts', 'content', 'content TEXT NOT NULL DEFAULT \'\'');
  ensureColumn('treehole_posts', 'like_count', 'like_count INTEGER NOT NULL DEFAULT 0');
  ensureColumn('treehole_posts', 'comment_count', 'comment_count INTEGER NOT NULL DEFAULT 0');
  ensureColumn('treehole_posts', 'created_at', 'created_at INTEGER');
  ensureColumn('treehole_posts', 'updated_at', 'updated_at INTEGER');
  ensureColumn('treehole_posts', 'published_at', 'published_at INTEGER');
  ensureColumn('treehole_posts', 'deleted_at', 'deleted_at INTEGER');

  ensureColumn('treehole_post_likes', 'created_at', 'created_at INTEGER');

  ensureColumn('treehole_comments', 'content', 'content TEXT NOT NULL DEFAULT \'\'');
  ensureColumn('treehole_comments', 'created_at', 'created_at INTEGER');
  ensureColumn('treehole_comments', 'updated_at', 'updated_at INTEGER');
  ensureColumn('treehole_comments', 'deleted_at', 'deleted_at INTEGER');
}

function backfillCriticalTimestamps(): void {
  const now = Date.now();

  sqliteDb.exec(`UPDATE users SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`);
  sqliteDb.exec(`UPDATE users SET last_login_at = ${now} WHERE last_login_at IS NULL OR last_login_at <= 0`);
  sqliteDb.exec(`UPDATE credentials SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`);
  sqliteDb.exec(`UPDATE credentials SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`);
  sqliteDb.exec(`UPDATE cache SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`);
  sqliteDb.exec(`UPDATE cache SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`);
  sqliteDb.exec(`UPDATE discover_posts SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`);
  sqliteDb.exec(`UPDATE discover_posts SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`);
  sqliteDb.exec(`UPDATE discover_posts SET published_at = ${now} WHERE published_at IS NULL OR published_at <= 0`);
  sqliteDb.exec(`UPDATE discover_post_ratings SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`);
  sqliteDb.exec(`UPDATE discover_post_ratings SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`);
  sqliteDb.exec(`UPDATE treehole_posts SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`);
  sqliteDb.exec(`UPDATE treehole_posts SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`);
  sqliteDb.exec(`UPDATE treehole_posts SET published_at = ${now} WHERE published_at IS NULL OR published_at <= 0`);
  sqliteDb.exec(`UPDATE treehole_post_likes SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`);
  sqliteDb.exec(`UPDATE treehole_comments SET created_at = ${now} WHERE created_at IS NULL OR created_at <= 0`);
  sqliteDb.exec(`UPDATE treehole_comments SET updated_at = ${now} WHERE updated_at IS NULL OR updated_at <= 0`);
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

  database.run(sql`CREATE TABLE IF NOT EXISTS discover_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT,
    store_name TEXT,
    price_text TEXT,
    content TEXT,
    category TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    images_json TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    cover_url TEXT NOT NULL,
    image_count INTEGER NOT NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    rating_sum INTEGER NOT NULL DEFAULT 0,
    rating_avg REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    published_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    deleted_at INTEGER
  )`);

  database.run(sql`CREATE TABLE IF NOT EXISTS discover_post_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES discover_posts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    score INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);

  database.run(sql`CREATE TABLE IF NOT EXISTS treehole_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    like_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    published_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    deleted_at INTEGER
  )`);

  database.run(sql`CREATE TABLE IF NOT EXISTS treehole_post_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES treehole_posts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);

  database.run(sql`CREATE TABLE IF NOT EXISTS treehole_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES treehole_posts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    deleted_at INTEGER
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
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_discover_posts_user_id ON discover_posts(user_id)`);
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_discover_posts_category ON discover_posts(category)`);
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_discover_posts_deleted_published ON discover_posts(deleted_at, published_at DESC)`);
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_discover_posts_deleted_rating_avg ON discover_posts(deleted_at, rating_avg DESC, published_at DESC)`);
  database.run(sql`DELETE FROM discover_post_ratings WHERE id NOT IN (
    SELECT MAX(id) FROM discover_post_ratings GROUP BY post_id, user_id
  )`);
  database.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_discover_post_ratings_post_user ON discover_post_ratings(post_id, user_id)`);
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_discover_post_ratings_user_id ON discover_post_ratings(user_id)`);
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_treehole_posts_user_id ON treehole_posts(user_id)`);
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_treehole_posts_deleted_published ON treehole_posts(deleted_at, published_at DESC, id DESC)`);
  database.run(sql`DELETE FROM treehole_post_likes WHERE id NOT IN (
    SELECT MAX(id) FROM treehole_post_likes GROUP BY post_id, user_id
  )`);
  database.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_treehole_post_likes_post_user ON treehole_post_likes(post_id, user_id)`);
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_treehole_post_likes_user_id ON treehole_post_likes(user_id)`);
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_treehole_comments_post_deleted_created ON treehole_comments(post_id, deleted_at, created_at ASC, id ASC)`);
  database.run(sql`CREATE INDEX IF NOT EXISTS idx_treehole_comments_user_id ON treehole_comments(user_id)`);
  database.run(sql`UPDATE treehole_posts
    SET like_count = (
      SELECT count(*) FROM treehole_post_likes WHERE treehole_post_likes.post_id = treehole_posts.id
    ),
    comment_count = (
      SELECT count(*) FROM treehole_comments
      WHERE treehole_comments.post_id = treehole_posts.id
        AND treehole_comments.deleted_at IS NULL
    )
  `);

  Logger.server('数据库初始化完成');
}

export { schema };
