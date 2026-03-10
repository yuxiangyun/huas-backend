import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import sharp from 'sharp';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { initDatabase, getDb, schema } from '../src/db';
import { registerRoutes } from '../src/routes';
import { generateToken } from '../src/auth/jwt';
import { config } from '../src/config';
import { DiscoverMediaService } from '../src/services/discover/media-service';

let authorId = 0;
let otherAuthorId = 0;
let raterId = 0;

function createApp() {
  const app = new Hono();
  app.get(`${config.discover.mediaBasePath}/*`, async (c) => {
    const file = await DiscoverMediaService.getPublicFile(c.req.path);
    if (!file) return c.notFound();

    return new Response(file, {
      headers: {
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Content-Type': file.type || 'application/octet-stream',
      },
    });
  });
  registerRoutes(app);
  return app;
}

async function createImageBuffer(color: string) {
  return sharp({
    create: {
      width: 1800,
      height: 1200,
      channels: 3,
      background: color,
    },
  }).jpeg({ quality: 92 }).toBuffer();
}

async function createUser(studentId: string, className: string) {
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

async function authHeaderFor(userId: number, studentId: string) {
  const token = await generateToken({ userId, studentId });
  return { Authorization: `Bearer ${token}` };
}

async function resetDiscoverData() {
  const db = getDb();
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
  await resetDiscoverData();
  authorId = await createUser('2023001001', '软件工程2401班');
  otherAuthorId = await createUser('2023001002', '信息工程学院 软件工程2402班');
  raterId = await createUser('2023001003', '计算机科学2401班');
});

describe('discover module', () => {
  it('发帖后直接发布，图片压缩为单份 webp，并可在我的帖子中看到', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('category', '其他');
    form.set('title', '今天午饭');
    form.append('tags', '辣');
    form.append('tags', '便宜');
    form.append('images', new File([await createImageBuffer('#ff8844')], 'food-a.jpg', { type: 'image/jpeg' }));

    const res = await app.request('http://localhost/api/discover/posts', {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023001001'),
      body: form,
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.category).toBe('其他');
    expect(body.data.tags).toEqual(['辣', '便宜']);
    expect(body.data.images).toHaveLength(1);
    expect(body.data.images[0].url.endsWith('.webp')).toBe(true);
    expect(body.data.author.label).toBe('软件工程');
    expect(body.data.rating.average).toBe(0);

    const relativePath = body.data.images[0].url.replace(`${config.discover.mediaBasePath}/`, '');
    const filePath = join(config.discover.storageRoot, relativePath);
    expect(await Bun.file(filePath).exists()).toBe(true);

    const myRes = await app.request('http://localhost/api/discover/posts/me', {
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(myRes.status).toBe(200);

    const myBody = await myRes.json() as any;
    expect(myBody.data.items).toHaveLength(1);
    expect(myBody.data.items[0].id).toBe(body.data.id);
    expect(myBody.data.items[0].isMine).toBe(true);
  });

  it('评分会更新平均分，高分列表与推荐列表按 discover 逻辑工作', async () => {
    const app = createApp();

    async function createPost(userId: number, studentId: string, title: string, category: string, tags: string[], color: string) {
      const form = new FormData();
      form.set('category', category);
      form.set('title', title);
      for (const tag of tags) form.append('tags', tag);
      form.append('images', new File([await createImageBuffer(color)], `${title}.jpg`, { type: 'image/jpeg' }));

      const res = await app.request('http://localhost/api/discover/posts', {
        method: 'POST',
        headers: await authHeaderFor(userId, studentId),
        body: form,
      });

      expect(res.status).toBe(201);
      const body = await res.json() as any;
      return body.data.id as number;
    }

    const postA = await createPost(authorId, '2023001001', '辣子鸡', '其他', ['辣', '下饭'], '#ff5533');
    const postB = await createPost(otherAuthorId, '2023001002', '红油抄手', '其他', ['辣', '香'], '#ff3311');

    const rateRes = await app.request(`http://localhost/api/discover/posts/${postA}/rating`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(raterId, '2023001003')),
      },
      body: JSON.stringify({ score: 5 }),
    });

    expect(rateRes.status).toBe(200);
    const rateBody = await rateRes.json() as any;
    expect(rateBody.data.rating.average).toBe(5);
    expect(rateBody.data.rating.count).toBe(1);
    expect(rateBody.data.rating.userScore).toBe(5);

    const scoreRes = await app.request('http://localhost/api/discover/posts?sort=score', {
      headers: await authHeaderFor(raterId, '2023001003'),
    });
    expect(scoreRes.status).toBe(200);
    const scoreBody = await scoreRes.json() as any;
    expect(scoreBody.data.items[0].id).toBe(postA);

    const recommendRes = await app.request('http://localhost/api/discover/posts?sort=recommended', {
      headers: await authHeaderFor(raterId, '2023001003'),
    });
    expect(recommendRes.status).toBe(200);
    const recommendBody = await recommendRes.json() as any;
    expect(recommendBody.data.items[0].id).toBe(postB);
  });

  it('推荐流在冷启动或无匹配时，不会返回自己的帖子或已评分帖子', async () => {
    const app = createApp();

    async function createPost(userId: number, studentId: string, title: string, tags: string[], color: string) {
      const form = new FormData();
      form.set('category', '其他');
      form.set('title', title);
      for (const tag of tags) form.append('tags', tag);
      form.append('images', new File([await createImageBuffer(color)], `${title}.jpg`, { type: 'image/jpeg' }));

      const res = await app.request('http://localhost/api/discover/posts', {
        method: 'POST',
        headers: await authHeaderFor(userId, studentId),
        body: form,
      });

      expect(res.status).toBe(201);
      const body = await res.json() as any;
      return body.data.id as number;
    }

    const selfPost = await createPost(authorId, '2023001001', '自己发的', ['辣'], '#cc5533');
    const otherPost = await createPost(otherAuthorId, '2023001002', '别人发的', ['辣'], '#3388cc');

    const coldStartRes = await app.request('http://localhost/api/discover/posts?sort=recommended', {
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(coldStartRes.status).toBe(200);

    const coldStartBody = await coldStartRes.json() as any;
    expect(coldStartBody.data.items.map((item: any) => item.id)).toEqual([otherPost]);
    expect(coldStartBody.data.items.some((item: any) => item.id === selfPost)).toBe(false);

    const rateRes = await app.request(`http://localhost/api/discover/posts/${otherPost}/rating`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(authorId, '2023001001')),
      },
      body: JSON.stringify({ score: 5 }),
    });
    expect(rateRes.status).toBe(200);

    const noMatchRes = await app.request('http://localhost/api/discover/posts?sort=recommended', {
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(noMatchRes.status).toBe(200);

    const noMatchBody = await noMatchRes.json() as any;
    expect(noMatchBody.data.items).toHaveLength(0);
  });

  it('管理员删除帖子后，帖子不再出现在公共列表且图片不可再访问', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('category', '1食堂');
    form.append('tags', '好吃');
    form.append('images', new File([await createImageBuffer('#44aa66')], 'food-c.jpg', { type: 'image/jpeg' }));

    const createRes = await app.request('http://localhost/api/discover/posts', {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023001001'),
      body: form,
    });
    expect(createRes.status).toBe(201);

    const createBody = await createRes.json() as any;
    const postId = createBody.data.id as number;
    const imageUrl = `http://localhost${createBody.data.images[0].url}`;
    const relativePath = createBody.data.images[0].url.replace(`${config.discover.mediaBasePath}/`, '');
    const filePath = join(config.discover.storageRoot, relativePath);

    const mediaBeforeDelete = await app.request(imageUrl);
    expect(mediaBeforeDelete.status).toBe(200);
    expect(mediaBeforeDelete.headers.get('cache-control')).toBe('no-store');
    expect(await Bun.file(filePath).exists()).toBe(true);

    const adminAuth = `Basic ${Buffer.from('202412040130:A18569081662').toString('base64')}`;
    const deleteRes = await app.request(`http://localhost/api/admin/discover/posts/${postId}`, {
      method: 'DELETE',
      headers: { Authorization: adminAuth },
    });

    expect(deleteRes.status).toBe(200);

    const listRes = await app.request('http://localhost/api/discover/posts?sort=latest', {
      headers: await authHeaderFor(raterId, '2023001003'),
    });
    const listBody = await listRes.json() as any;
    expect(listBody.data.items).toHaveLength(0);

    const mediaAfterDelete = await app.request(imageUrl);
    expect(mediaAfterDelete.status).toBe(404);
    expect(await Bun.file(filePath).exists()).toBe(false);

    const post = await getDb().select({
      deletedAt: schema.discoverPosts.deletedAt,
    }).from(schema.discoverPosts).where(eq(schema.discoverPosts.id, postId));
    expect(post[0].deletedAt).toBeTruthy();
  });
});
