/**
 * [INPUT]: 依赖 Bun Test hooks、Hono、Discover 路由、SQLite、sharp、JWT 与 UGC 运行态
 * [OUTPUT]: 提供 Discover HTTP 测试应用、用户/媒体/帖子/评论夹具及逐用例数据重置
 * [POS]: tests/discover 的共享测试支架，只承载可复用准备逻辑，不定义业务断言
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, beforeAll, beforeEach, expect } from 'bun:test';
import { Hono } from 'hono';
import sharp from 'sharp';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { initDatabase, getDb, schema } from '../../src/db';
import { registerRoutes } from '../../src/routes';
import { generateToken } from '../../src/auth/jwt';
import { config } from '../../src/config';
import { ugcComplianceState } from '../../src/runtime/ugc-compliance-state';
import {
  DiscoverMediaService,
  DISCOVER_MEDIA_CACHE_CONTROL,
} from '../../src/services/discover/media-service';

export let authorId = 0;
export let otherAuthorId = 0;
export let raterId = 0;
export const REAL_HEIC_FIXTURE = join(process.cwd(), 'tests/fixtures/iphone.heic');
export const OLD_DISCOVER_IMAGE_LIMIT_BYTES = 8 * 1024 * 1024;

export function createApp() {
  const app = new Hono();
  app.get(`${config.discover.mediaBasePath}/*`, async (c) => {
    const file = await DiscoverMediaService.getPublicFile(c.req.path);
    if (!file) return c.notFound();

    return new Response(file, {
      headers: {
        'Cache-Control': DISCOVER_MEDIA_CACHE_CONTROL,
        'Content-Type': file.type || 'application/octet-stream',
      },
    });
  });
  registerRoutes(app);
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

  for (let index = 0; index < raw.length; index += 1) {
    raw[index] = (index * 31 + 17) % 256;
  }

  return sharp(raw, {
    raw: {
      width,
      height,
      channels,
    },
  }).png({ compressionLevel: 0 }).toBuffer();
}

export async function createHeifFamilyBuffer(color: string) {
  return sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: color,
    },
  }).avif({ quality: 62 }).toBuffer();
}

export async function createRealHeicBuffer() {
  const file = Bun.file(REAL_HEIC_FIXTURE);
  return Buffer.from(await file.arrayBuffer());
}

export async function createAnimatedWebpBuffer() {
  const width = 32;
  const pageHeight = 24;
  const channels = 4;
  const frameA = Buffer.alloc(width * pageHeight * channels, 0);
  const frameB = Buffer.alloc(width * pageHeight * channels, 0);

  for (let index = 0; index < frameA.length; index += 4) {
    frameA[index] = 255;
    frameA[index + 1] = 82;
    frameA[index + 3] = 255;
    frameB[index + 2] = 255;
    frameB[index + 1] = 138;
    frameB[index + 3] = 255;
  }

  return sharp(Buffer.concat([frameA, frameB]), {
    raw: {
      width,
      height: pageHeight * 2,
      channels,
      pageHeight,
    },
  }).webp({
    loop: 0,
    delay: [120, 180],
  }).toBuffer();
}

export async function createUser(studentId: string, className: string) {
  const db = getDb();
  const now = new Date();
  const inserted = await db.insert(schema.users).values({
    studentId,
    name: studentId,
    className,
    createdAt: now,
    lastLoginAt: now,
  }).returning({ id: schema.users.id });

  return inserted[0].id as number;
}

export async function authHeaderFor(userId: number, studentId: string) {
  const token = await generateToken({ userId, studentId });
  return { Authorization: `Bearer ${token}` };
}

export async function adminSessionHeader(app: Hono) {
  const response = await app.request('http://localhost/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'test-admin-password' }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  return cookie ? { Cookie: cookie } : {};
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
  }
) {
  const form = new FormData();
  form.set('category', options.category ?? '其他');
  form.set('title', options.title);
  form.set('storeName', options.storeName ?? '测试档口');
  form.set('priceText', options.priceText ?? '12元');
  form.set('content', options.content ?? `${options.title} 很下饭，分量稳定。`);

  for (const tag of options.tags ?? ['好吃']) {
    form.append('tags', tag);
  }

  form.append(
    'images',
    new File(
      [await createImageBuffer(options.color ?? '#ffaa66')],
      `${options.title}.jpg`,
      { type: 'image/jpeg' }
    )
  );

  const res = await app.request('http://localhost/api/discover/posts', {
    method: 'POST',
    headers: await authHeaderFor(options.userId, options.studentId),
    body: form,
  });

  expect(res.status).toBe(201);
  const body = await res.json() as any;
  return body.data as any;
}

export async function createDiscoverComment(
  app: Hono,
  options: {
    postId: number;
    userId: number;
    studentId: string;
    content: string;
    parentCommentId?: number;
  }
) {
  const payload: Record<string, unknown> = { content: options.content };
  if (options.parentCommentId !== undefined) {
    payload.parentCommentId = options.parentCommentId;
  }

  const res = await app.request(`http://localhost/api/discover/posts/${options.postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(options.userId, options.studentId)),
    },
    body: JSON.stringify(payload),
  });

  expect(res.status).toBe(201);
  const body = await res.json() as any;
  return body.data as any;
}

export async function resetDiscoverData() {
  const db = getDb();
  await db.delete(schema.treeholeCommentNotifications);
  await db.delete(schema.treeholePostLikes);
  await db.delete(schema.treeholeComments);
  await db.delete(schema.treeholePosts);
  await db.delete(schema.discoverComments);
  await db.delete(schema.discoverPostRatings);
  await db.delete(schema.discoverPosts);
  await db.delete(schema.credentials);
  await db.delete(schema.cache);
  await db.delete(schema.users);
  rmSync(config.discover.storageRoot, { recursive: true, force: true });
}

beforeAll(() => {
  initDatabase();
});

beforeEach(async () => {
  ugcComplianceState.configure({
    mode: 'normal',
    discoverMockText: '',
    treeholeMockText: '',
  }, 'test');
  await resetDiscoverData();
  authorId = await createUser('2023001001', '软件工程2401班');
  otherAuthorId = await createUser('2023001002', '信息工程学院 软件工程2402班');
  raterId = await createUser('2023001003', '计算机科学2401班');
});

afterEach(() => {
  ugcComplianceState.configure({
    mode: 'normal',
    discoverMockText: '',
    treeholeMockText: '',
  }, 'test');
});


export {
  Hono,
  sharp,
  eq,
  getDb,
  schema,
  config,
  ugcComplianceState,
  DiscoverMediaService,
  DISCOVER_MEDIA_CACHE_CONTROL,
};
