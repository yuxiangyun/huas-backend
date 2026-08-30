/**
 * [INPUT]: 依赖 Bun Test hooks、注入式 Discover/Notifications 模块、Community/Identity 资料端口、SQLite、sharp、JWT 与认证中间件
 * [OUTPUT]: 提供含匿名只读/认证写入边界的 Discover HTTP 测试应用、真实 Outbox 模块、用户/媒体/帖子/评论夹具及数据重置
 * [POS]: tests/discover 的共享测试支架，直接装配 canonical 公开与认证路由切片，不经过根 composition 或静态 singleton
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, expect } from 'bun:test';
import { Hono } from 'hono';
import sharp from 'sharp';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { generateToken } from '../../src/auth/jwt';
import { config } from '../../src/config';
import { getDb, schema } from '../../src/db';
import { authMiddleware } from '../../src/middleware/auth.middleware';
import { onAppError } from '../../src/middleware/error.middleware';
import { CommunityApplicationService } from '../../src/modules/community/application/community-application-service';
import { SQLiteCommunityProfileRepository } from '../../src/modules/community/infrastructure/sqlite-community-profile-repository';
import { createDiscoverModule } from '../../src/modules/discover/composition';
import { createNotificationsModule } from '../../src/modules/notifications/composition';
import { SQLiteCommunityIdentityReader } from '../../src/modules/identity/infrastructure/sqlite-community-identity-reader';
import { DISCOVER_MEDIA_CACHE_CONTROL } from '../../src/modules/discover/infrastructure/discover-media-service';
import { clearSocialTestData } from '../social-database';

export let authorId = 0;
export let otherAuthorId = 0;
export let likerId = 0;
export const REAL_HEIC_FIXTURE = join(process.cwd(), 'tests/fixtures/iphone.heic');
export const OLD_DISCOVER_IMAGE_LIMIT_BYTES = 8 * 1024 * 1024;

export function createProfileReader() {
  const db = getDb();
  return new CommunityApplicationService(
    new SQLiteCommunityIdentityReader(db),
    new SQLiteCommunityProfileRepository(db),
    {
      async storeAvatar() { throw new Error('测试资料读取器不处理头像写入'); },
      async removeAvatar() {},
      async cleanupOrphans() { return 0; },
    },
  );
}

export function createTestDiscoverModule() {
  const db = getDb();
  const profileReader = createProfileReader();
  const notifications = createNotificationsModule({ db, profileReader });
  return createDiscoverModule({
    db,
    profileReader,
    activityOutbox: notifications.outboxWriter,
    activityProjection: {
      async attempt() {
        await notifications.projector.runOnce();
      },
    },
  });
}

export function createApp(module = createTestDiscoverModule()) {
  const app = new Hono();
  app.onError(onAppError);
  app.get(`${config.discover.mediaBasePath}/*`, async (c) => {
    const file = await module.media.getPublicFile(c.req.path);
    if (!file) return c.notFound();
    return new Response(file, {
      headers: {
        'Cache-Control': DISCOVER_MEDIA_CACHE_CONTROL,
        'Content-Type': file.type || 'application/octet-stream',
      },
    });
  });
  app.route('/api/public/discover', module.publicRoutes);
  app.all('/api/public/discover/*', (c) => c.notFound());

  const api = new Hono();
  api.use('*', authMiddleware);
  api.route('/discover', module.routes);
  app.route('/api', api);
  return app;
}

export async function createImageBuffer(color: string) {
  return sharp({
    create: {
      width: 1800,
      height: 1200,
      channels: 3,
      background: color,
    },
  }).jpeg({ quality: 92 }).toBuffer();
}

export async function createLargePhoneImageBuffer() {
  const width = 2200;
  const height = 2200;
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let index = 0; index < raw.length; index += 1) raw[index] = (index * 31 + 17) % 256;

  return sharp(raw, { raw: { width, height, channels } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

export async function createHeifFamilyBuffer(color: string) {
  return sharp({
    create: { width: 640, height: 480, channels: 3, background: color },
  }).avif({ quality: 62 }).toBuffer();
}

export async function createRealHeicBuffer() {
  return Buffer.from(await Bun.file(REAL_HEIC_FIXTURE).arrayBuffer());
}

export async function createAnimatedWebpBuffer() {
  const width = 32;
  const pageHeight = 24;
  const channels = 4;
  const frameA = Buffer.alloc(width * pageHeight * channels);
  const frameB = Buffer.alloc(width * pageHeight * channels);

  for (let index = 0; index < frameA.length; index += 4) {
    frameA[index] = 255;
    frameA[index + 1] = 82;
    frameA[index + 3] = 255;
    frameB[index + 2] = 255;
    frameB[index + 1] = 138;
    frameB[index + 3] = 255;
  }

  return sharp(Buffer.concat([frameA, frameB]), {
    raw: { width, height: pageHeight * 2, channels, pageHeight },
  }).webp({ loop: 0, delay: [120, 180] }).toBuffer();
}

export async function createUser(studentId: string, className: string | null) {
  const now = new Date();
  const inserted = await getDb().insert(schema.users).values({
    studentId,
    name: studentId,
    className,
    createdAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
  }).returning({ id: schema.users.id });
  return inserted[0].id as number;
}

export async function setCommunityProfile(
  userId: number,
  profile: { nickname?: string | null; avatarUrl?: string | null },
) {
  await getDb().insert(schema.communityProfiles).values({
    userId,
    nickname: profile.nickname ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: schema.communityProfiles.userId,
    set: {
      nickname: profile.nickname ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      updatedAt: new Date(),
    },
  });
}

export async function authHeaderFor(userId: number, studentId: string) {
  const token = await generateToken({ userId, studentId });
  return { Authorization: `Bearer ${token}` };
}

export async function createDiscoverPost(
  app: Hono,
  options: {
    userId: number;
    studentId: string;
    title: string;
    category?: string;
    tags?: string[];
    storeName?: string;
    priceText?: string;
    content?: string;
    color?: string;
  },
) {
  const form = new FormData();
  form.set('category', options.category ?? '其他');
  form.set('title', options.title);
  form.set('storeName', options.storeName ?? '测试档口');
  form.set('priceText', options.priceText ?? '12元');
  form.set('content', options.content ?? `${options.title} 很下饭，分量稳定。`);
  for (const tag of options.tags ?? ['好吃']) form.append('tags', tag);
  form.append('images', new File(
    [await createImageBuffer(options.color ?? '#ffaa66')],
    `${options.title}.jpg`,
    { type: 'image/jpeg' },
  ));

  const response = await app.request('http://localhost/api/discover/posts', {
    method: 'POST',
    headers: await authHeaderFor(options.userId, options.studentId),
    body: form,
  });
  expect(response.status).toBe(201);
  return (await response.json() as any).data as any;
}

export async function createDiscoverComment(
  app: Hono,
  options: {
    postId: number;
    userId: number;
    studentId: string;
    content: string;
    parentCommentId?: number;
  },
) {
  const response = await app.request(`http://localhost/api/discover/posts/${options.postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(options.userId, options.studentId)),
    },
    body: JSON.stringify({
      content: options.content,
      ...(options.parentCommentId === undefined ? {} : { parentCommentId: options.parentCommentId }),
    }),
  });
  expect(response.status).toBe(201);
  return (await response.json() as any).data as any;
}

export async function resetDiscoverData() {
  const db = getDb();
  await clearSocialTestData(db);
  rmSync(config.discover.storageRoot, { recursive: true, force: true });
}

beforeEach(async () => {
  await resetDiscoverData();
  authorId = await createUser('2023001001', '软件工程2401班');
  otherAuthorId = await createUser('2023001002', '信息工程学院 软件工程2402班');
  likerId = await createUser('2023001003', '计算机科学2401班');
});

export {
  Hono,
  sharp,
  eq,
  getDb,
  schema,
  config,
  DISCOVER_MEDIA_CACHE_CONTROL,
};
