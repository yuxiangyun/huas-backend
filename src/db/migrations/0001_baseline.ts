/**
 * [INPUT]: 依赖 Bun SQLite 执行标准、当前生产 schema 的表与索引定义
 * [OUTPUT]: 对外提供不可变的 0001 baseline migration
 * [POS]: migrations 的初始结构快照，供空库初始化与既有数据库指纹 adoption 共用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const baselineSql = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL UNIQUE,
  name TEXT,
  class_name TEXT,
  treehole_avatar_url TEXT,
  encrypted_password TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  last_login_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  last_active_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  system TEXT NOT NULL,
  value TEXT,
  cookie_jar TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_at INTEGER
);
CREATE TABLE discover_posts (
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
  comment_count INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  rating_sum INTEGER NOT NULL DEFAULT 0,
  rating_avg REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  published_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  deleted_at INTEGER
);
CREATE TABLE discover_post_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES discover_posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE discover_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES discover_posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  parent_comment_id INTEGER REFERENCES discover_comments(id),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  deleted_at INTEGER
);
CREATE TABLE treehole_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  published_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  deleted_at INTEGER
);
CREATE TABLE treehole_post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES treehole_posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE treehole_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES treehole_posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  parent_comment_id INTEGER REFERENCES treehole_comments(id),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  deleted_at INTEGER
);
CREATE TABLE treehole_comment_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id),
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  post_id INTEGER NOT NULL REFERENCES treehole_posts(id),
  comment_id INTEGER NOT NULL REFERENCES treehole_comments(id),
  type TEXT NOT NULL,
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE analytics_daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  platform TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE analytics_daily_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  platform TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX idx_credentials_user_system ON credentials(user_id, system);
CREATE INDEX idx_cache_key ON cache(key);
CREATE INDEX idx_cache_expires ON cache(expires_at);
CREATE INDEX idx_users_last_active_at ON users(last_active_at);
CREATE INDEX idx_discover_posts_user_id ON discover_posts(user_id);
CREATE INDEX idx_discover_posts_category ON discover_posts(category);
CREATE INDEX idx_discover_posts_deleted_published ON discover_posts(deleted_at, published_at DESC);
CREATE INDEX idx_discover_posts_deleted_rating_avg ON discover_posts(deleted_at, rating_avg DESC, published_at DESC);
CREATE UNIQUE INDEX idx_discover_post_ratings_post_user ON discover_post_ratings(post_id, user_id);
CREATE INDEX idx_discover_post_ratings_user_id ON discover_post_ratings(user_id);
CREATE INDEX idx_discover_comments_post_deleted_created ON discover_comments(post_id, deleted_at, created_at ASC, id ASC);
CREATE INDEX idx_discover_comments_parent_comment_id ON discover_comments(parent_comment_id);
CREATE INDEX idx_discover_comments_user_id ON discover_comments(user_id);
CREATE INDEX idx_treehole_posts_user_id ON treehole_posts(user_id);
CREATE INDEX idx_treehole_posts_deleted_published ON treehole_posts(deleted_at, published_at DESC, id DESC);
CREATE UNIQUE INDEX idx_treehole_post_likes_post_user ON treehole_post_likes(post_id, user_id);
CREATE INDEX idx_treehole_post_likes_user_id ON treehole_post_likes(user_id);
CREATE INDEX idx_treehole_comments_post_deleted_created ON treehole_comments(post_id, deleted_at, created_at ASC, id ASC);
CREATE INDEX idx_treehole_comments_parent_comment_id ON treehole_comments(parent_comment_id);
CREATE INDEX idx_treehole_comments_user_id ON treehole_comments(user_id);
CREATE INDEX idx_treehole_comment_notifications_recipient_read_created
  ON treehole_comment_notifications(recipient_user_id, read_at, created_at DESC, id DESC);
CREATE INDEX idx_treehole_comment_notifications_post_id ON treehole_comment_notifications(post_id);
CREATE INDEX idx_treehole_comment_notifications_comment_id ON treehole_comment_notifications(comment_id);
CREATE UNIQUE INDEX idx_analytics_daily_metric ON analytics_daily_metrics(day, platform, metric);
CREATE UNIQUE INDEX idx_analytics_daily_user ON analytics_daily_users(day, platform, user_id);
CREATE INDEX idx_analytics_daily_users_day ON analytics_daily_users(day);
`;
