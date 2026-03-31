import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  studentId: text('student_id').notNull().unique(),
  name: text('name'),
  className: text('class_name'),
  treeholeAvatarUrl: text('treehole_avatar_url'),
  encryptedPassword: text('encrypted_password'), // AES-GCM encrypted, for silent re-auth
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const credentials = sqliteTable('credentials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  system: text('system').notNull(), // 'cas_tgc' | 'portal_jwt' | 'jw_session'
  value: text('value'),
  cookieJar: text('cookie_jar'), // JSON serialized CookieJar
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
  ratingCount: integer('rating_count').notNull().default(0),
  ratingSum: integer('rating_sum').notNull().default(0),
  ratingAvg: real('rating_avg').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export const discoverPostRatings = sqliteTable('discover_post_ratings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull().references(() => discoverPosts.id),
  userId: integer('user_id').notNull().references(() => users.id),
  score: integer('score').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  postUserUnique: unique('uq_discover_post_ratings_post_user').on(table.postId, table.userId),
}));

export const discoverComments = sqliteTable('discover_comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull().references(() => discoverPosts.id),
  userId: integer('user_id').notNull().references(() => users.id),
  parentCommentId: integer('parent_comment_id').references(() => discoverComments.id),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export const treeholePosts = sqliteTable('treehole_posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  likeCount: integer('like_count').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

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
  parentCommentId: integer('parent_comment_id').references(() => treeholeComments.id),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export const treeholeCommentNotifications = sqliteTable('treehole_comment_notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipientUserId: integer('recipient_user_id').notNull().references(() => users.id),
  actorUserId: integer('actor_user_id').notNull().references(() => users.id),
  postId: integer('post_id').notNull().references(() => treeholePosts.id),
  commentId: integer('comment_id').notNull().references(() => treeholeComments.id),
  type: text('type').notNull(), // 'post_comment' | 'comment_reply'
  readAt: integer('read_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});
