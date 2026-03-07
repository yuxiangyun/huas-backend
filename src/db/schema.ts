import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  studentId: text('student_id').notNull().unique(),
  name: text('name'),
  className: text('class_name'),
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
