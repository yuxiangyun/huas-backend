/**
 * [INPUT]: 依赖 drizzle-orm/sqlite-core 的表、列、索引、检查与唯一键构造器
 * [OUTPUT]: 对外提供 Identity、Community、Discover、含私有图片元数据的 Treehole、Notifications、Messaging 与 analytics 全部 SQLite 表定义
 * [POS]: db 的全局 Drizzle 类型相；migration 是结构事实源，各纵向模块只消费自己拥有的表
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, integer, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  studentId: text('student_id').notNull().unique(),
  name: text('name'),
  className: text('class_name'),
  encryptedPassword: text('encrypted_password'), // AES-GCM encrypted, for silent re-auth
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const communityProfiles = sqliteTable('community_profiles', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  nickname: text('nickname'),
  avatarUrl: text('avatar_url'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const credentials = sqliteTable('credentials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  // 三类 TTL 学校凭证 + interactive_login_required + school_login_epoch + derived_session:*。
  // mobile-yxt 只经模块自有仓储使用 derived_session:mobile_yxt；通用 CredentialManager 不解释派生会话。
  system: text('system').notNull(),
  value: text('value'),
  cookieJar: text('cookie_jar'), // JSON serialized CookieJar；mobile-yxt 只允许目标域 /server JSESSIONID
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  userSystemUnique: unique('uq_credentials_user_system').on(table.userId, table.system),
}));

export const cache = sqliteTable('cache', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  data: text('data').notNull(), // JSON serialized
  source: text('source'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
});

export const discoverPosts = sqliteTable('discover_posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  title: text('title'),
  storeName: text('store_name'),
  priceText: text('price_text'),
  content: text('content'),
  category: text('category').notNull(),
  storageKey: text('storage_key').notNull(),
  imagesJson: text('images_json').notNull(),
  tagsJson: text('tags_json').notNull(),
  coverUrl: text('cover_url').notNull(),
  imageCount: integer('image_count').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  likeCount: integer('like_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export const discoverPostLikes = sqliteTable('discover_post_likes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull().references(() => discoverPosts.id),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  postUserUnique: unique('uq_discover_post_likes_post_user').on(table.postId, table.userId),
}));

export const discoverComments = sqliteTable('discover_comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull().references(() => discoverPosts.id),
  userId: integer('user_id').notNull().references(() => users.id),
  parentCommentId: integer('parent_comment_id').references((): AnySQLiteColumn => discoverComments.id),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export const treeholePosts = sqliteTable('treehole_posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  mediaKey: text('media_key'),
  imagesJson: text('images_json').notNull().default('[]'),
  likeCount: integer('like_count').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
}, (table) => ({
  mediaKeyUnique: uniqueIndex('uq_treehole_posts_media_key')
    .on(table.mediaKey)
    .where(sql`${table.mediaKey} IS NOT NULL`),
}));

export const treeholePostLikes = sqliteTable('treehole_post_likes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull().references(() => treeholePosts.id),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  postUserUnique: unique('uq_treehole_post_likes_post_user').on(table.postId, table.userId),
}));

export const treeholeComments = sqliteTable('treehole_comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull().references(() => treeholePosts.id),
  userId: integer('user_id').notNull().references(() => users.id),
  parentCommentId: integer('parent_comment_id').references((): AnySQLiteColumn => treeholeComments.id),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export const activityOutbox = sqliteTable('activity_outbox', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: text('event_id').notNull().unique(),
  recipientUserId: integer('recipient_user_id').notNull().references(() => users.id),
  actorUserId: integer('actor_user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: integer('resource_id').notNull(),
  subresourceId: integer('subresource_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  processedAt: integer('processed_at', { mode: 'timestamp_ms' }),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }),
  lastError: text('last_error'),
}, (table) => ({
  attemptCountNonNegative: check('ck_activity_outbox_attempt_count', sql`${table.attemptCount} >= 0`),
  pendingIndex: index('idx_activity_outbox_pending').on(table.processedAt, table.nextAttemptAt, table.id),
}));

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: text('event_id').notNull().unique(),
  recipientUserId: integer('recipient_user_id').notNull().references(() => users.id),
  actorUserId: integer('actor_user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: integer('resource_id').notNull(),
  subresourceId: integer('subresource_id'),
  readAt: integer('read_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  recipientCreatedIndex: index('idx_notifications_recipient_created')
    .on(table.recipientUserId, sql`${table.createdAt} DESC`, sql`${table.id} DESC`),
  recipientReadCreatedIndex: index('idx_notifications_recipient_read_created')
    .on(table.recipientUserId, table.readAt, sql`${table.createdAt} DESC`, sql`${table.id} DESC`),
}));

export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userLowId: integer('user_low_id').notNull().references(() => users.id),
  userHighId: integer('user_high_id').notNull().references(() => users.id),
  lowLastReadMessageId: integer('low_last_read_message_id')
    .references((): AnySQLiteColumn => messages.id),
  highLastReadMessageId: integer('high_last_read_message_id')
    .references((): AnySQLiteColumn => messages.id),
  lastMessageId: integer('last_message_id').references((): AnySQLiteColumn => messages.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  orderedPair: check('ck_conversations_ordered_pair', sql`${table.userLowId} < ${table.userHighId}`),
  pairUnique: unique('uq_conversations_user_pair').on(table.userLowId, table.userHighId),
  lowLastMessageIndex: index('idx_conversations_low_last_message')
    .on(table.userLowId, table.lastMessageId, table.id),
  highLastMessageIndex: index('idx_conversations_high_last_message')
    .on(table.userHighId, table.lastMessageId, table.id),
  lastMessageIndex: index('idx_conversations_last_message').on(table.lastMessageId, table.id),
}));

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull()
    .references((): AnySQLiteColumn => conversations.id),
  senderUserId: integer('sender_user_id').notNull().references(() => users.id),
  clientMessageId: text('client_message_id').notNull(),
  text: text('text'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  senderClientUnique: unique('uq_messages_sender_client').on(table.senderUserId, table.clientMessageId),
  clientMessageIdLength: check('ck_messages_client_message_id_length', sql`length(${table.clientMessageId}) = 36`),
  textLength: check('ck_messages_text_length', sql`${table.text} IS NULL OR length(${table.text}) BETWEEN 1 AND 1000`),
  conversationIndex: index('idx_messages_conversation_id').on(table.conversationId, table.id),
  senderCreatedIndex: index('idx_messages_sender_created')
    .on(table.senderUserId, table.createdAt, table.id),
}));

export const messageImages = sqliteTable('message_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  messageId: integer('message_id').notNull().references(() => messages.id),
  storageKey: text('storage_key').notNull().unique(),
  sortOrder: integer('sort_order').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  mimeType: text('mime_type').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  messageOrderUnique: unique('uq_message_images_message_order').on(table.messageId, table.sortOrder),
  sortOrderRange: check('ck_message_images_sort_order', sql`${table.sortOrder} BETWEEN 0 AND 8`),
  widthPositive: check('ck_message_images_width', sql`${table.width} > 0`),
  heightPositive: check('ck_message_images_height', sql`${table.height} > 0`),
  sizePositive: check('ck_message_images_size', sql`${table.sizeBytes} > 0`),
  webpOnly: check('ck_message_images_mime_type', sql`${table.mimeType} = 'image/webp'`),
}));

export const analyticsDailyMetrics = sqliteTable('analytics_daily_metrics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  day: text('day').notNull(),
  platform: text('platform').notNull(),
  metric: text('metric').notNull(),
  value: integer('value').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  dayPlatformMetricUnique: unique('uq_analytics_daily_metric').on(table.day, table.platform, table.metric),
}));

export const analyticsDailyUsers = sqliteTable('analytics_daily_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  day: text('day').notNull(),
  platform: text('platform').notNull(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  dayPlatformUserUnique: unique('uq_analytics_daily_user').on(table.day, table.platform, table.userId),
}));
