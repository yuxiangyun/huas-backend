/**
 * [INPUT]: 依赖 0001/0002 已存在的用户、Discover、Treehole 与分析事实表
 * [OUTPUT]: 对外提供破坏性的社交架构迁移，直接丢弃旧评分/旧通知并建立 Community、点赞、Outbox、通知与一对一私信最终结构
 * [POS]: migrations 的第三个 contract migration，仅在停流量、快照和显式 destructive 授权后执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

const STATEMENT_BOUNDARY = '-- @migration-statement-boundary';

const socialRearchitectureSource = `
DROP TABLE IF EXISTS temp._social_0003_counts;
DROP TABLE IF EXISTS temp._social_0003_assertions;

CREATE TEMP TABLE _social_0003_counts (
  users_count INTEGER NOT NULL,
  credentials_count INTEGER NOT NULL,
  cache_count INTEGER NOT NULL,
  discover_posts_count INTEGER NOT NULL,
  discover_comments_count INTEGER NOT NULL,
  treehole_posts_count INTEGER NOT NULL,
  treehole_comments_count INTEGER NOT NULL,
  treehole_post_likes_count INTEGER NOT NULL
);

INSERT INTO _social_0003_counts VALUES (
  (SELECT COUNT(*) FROM users),
  (SELECT COUNT(*) FROM credentials),
  (SELECT COUNT(*) FROM cache),
  (SELECT COUNT(*) FROM discover_posts),
  (SELECT COUNT(*) FROM discover_comments),
  (SELECT COUNT(*) FROM treehole_posts),
  (SELECT COUNT(*) FROM treehole_comments),
  (SELECT COUNT(*) FROM treehole_post_likes)
);

CREATE TEMP TABLE _social_0003_assertions (
  ok INTEGER NOT NULL CHECK (ok = 1)
);

${STATEMENT_BOUNDARY}
CREATE TABLE community_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT,
  avatar_url TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT INTO community_profiles (user_id, nickname, avatar_url, updated_at)
SELECT
  id,
  NULLIF(TRIM(community_nickname), ''),
  NULLIF(TRIM(treehole_avatar_url), ''),
  (unixepoch() * 1000)
FROM users;

ALTER TABLE users DROP COLUMN community_nickname;
ALTER TABLE users DROP COLUMN treehole_avatar_url;

DROP INDEX idx_discover_posts_deleted_rating_avg;
DROP TABLE discover_post_ratings;
ALTER TABLE discover_posts DROP COLUMN rating_count;
ALTER TABLE discover_posts DROP COLUMN rating_sum;
ALTER TABLE discover_posts DROP COLUMN rating_avg;
ALTER TABLE discover_posts ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE discover_post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES discover_posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX idx_discover_post_likes_post_user
  ON discover_post_likes(post_id, user_id);
CREATE INDEX idx_discover_post_likes_user_id
  ON discover_post_likes(user_id);
CREATE INDEX idx_discover_posts_deleted_likes_published
  ON discover_posts(deleted_at, like_count DESC, published_at DESC, id DESC);

DROP TABLE treehole_comment_notifications;

CREATE TABLE activity_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id),
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER NOT NULL,
  subresource_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  processed_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at INTEGER,
  last_error TEXT
);
CREATE INDEX idx_activity_outbox_pending
  ON activity_outbox(processed_at, next_attempt_at, id);
CREATE INDEX idx_activity_outbox_recipient
  ON activity_outbox(recipient_user_id, created_at DESC, id DESC);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id),
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER NOT NULL,
  subresource_id INTEGER,
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX idx_notifications_recipient_read_created
  ON notifications(recipient_user_id, read_at, created_at DESC, id DESC);
CREATE INDEX idx_notifications_recipient_created
  ON notifications(recipient_user_id, created_at DESC, id DESC);
CREATE INDEX idx_notifications_actor_created
  ON notifications(actor_user_id, created_at DESC, id DESC);
CREATE INDEX idx_notifications_resource
  ON notifications(resource_type, resource_id, subresource_id);

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_low_id INTEGER NOT NULL REFERENCES users(id),
  user_high_id INTEGER NOT NULL REFERENCES users(id),
  low_last_read_message_id INTEGER REFERENCES messages(id),
  high_last_read_message_id INTEGER REFERENCES messages(id),
  last_message_id INTEGER REFERENCES messages(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK (user_low_id < user_high_id),
  UNIQUE (user_low_id, user_high_id)
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  sender_user_id INTEGER NOT NULL REFERENCES users(id),
  client_message_id TEXT NOT NULL,
  text TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  CHECK (length(client_message_id) = 36),
  CHECK (text IS NULL OR length(text) BETWEEN 1 AND 1000),
  UNIQUE (sender_user_id, client_message_id)
);

CREATE TABLE message_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id),
  storage_key TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 8),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/webp'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE (message_id, sort_order)
);

CREATE INDEX idx_conversations_low_updated
  ON conversations(user_low_id, updated_at DESC, id DESC);
CREATE INDEX idx_conversations_high_updated
  ON conversations(user_high_id, updated_at DESC, id DESC);
CREATE INDEX idx_conversations_low_last_message
  ON conversations(user_low_id, last_message_id ASC, id ASC);
CREATE INDEX idx_conversations_high_last_message
  ON conversations(user_high_id, last_message_id ASC, id ASC);
CREATE INDEX idx_conversations_last_message
  ON conversations(last_message_id ASC, id ASC);
CREATE INDEX idx_messages_conversation_id
  ON messages(conversation_id, id ASC);
CREATE INDEX idx_messages_sender_created
  ON messages(sender_user_id, created_at DESC, id DESC);
CREATE INDEX idx_message_images_message_order
  ON message_images(message_id, sort_order ASC);

-- 核心事实表必须逐表守恒；断言失败会回滚本 migration 的全部 DDL/DML。
${STATEMENT_BOUNDARY}
INSERT INTO _social_0003_assertions (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM users) = counts.users_count
  AND (SELECT COUNT(*) FROM credentials) = counts.credentials_count
  AND (SELECT COUNT(*) FROM cache) = counts.cache_count
  AND (SELECT COUNT(*) FROM discover_posts) = counts.discover_posts_count
  AND (SELECT COUNT(*) FROM discover_comments) = counts.discover_comments_count
  AND (SELECT COUNT(*) FROM treehole_posts) = counts.treehole_posts_count
  AND (SELECT COUNT(*) FROM treehole_comments) = counts.treehole_comments_count
  AND (SELECT COUNT(*) FROM treehole_post_likes) = counts.treehole_post_likes_count
  AND (SELECT COUNT(*) FROM community_profiles) = counts.users_count
THEN 1 ELSE 0 END
FROM _social_0003_counts AS counts;

${STATEMENT_BOUNDARY}
DROP TABLE temp._social_0003_assertions;
DROP TABLE temp._social_0003_counts;
`;

export const socialRearchitectureStatements = socialRearchitectureSource
  .split(STATEMENT_BOUNDARY)
  .map((statement) => statement.trim())
  .filter(Boolean);

export const socialRearchitectureSql = socialRearchitectureStatements.join('\n');
