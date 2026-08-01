/**
 * [INPUT]: 依赖 Treehole multipart/私有媒体测试支架、共享图片编码器、上传并发门禁、文件系统与真实 SQLite 引用
 * [OUTPUT]: 验证文本/多图发帖、混合字段顺序、压缩硬边界、失败补偿、Bearer/Cookie 读取、软删除失效与宽限期孤儿回收
 * [POS]: tests/treehole 的私有帖子图片专项用例，锁定小内存服务器上的有界摄取和媒体生命周期
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdir, readdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTreeholeRoutes } from '../../src/modules/treehole/http/treehole.routes';
import { TreeholeUploadGate } from '../../src/modules/treehole/http/treehole-upload-gate';
import { multipartRequestMaxBytes } from '../../src/utils/request-body-limit';
import {
  authorId,
  otherUserId,
  authHeaderFor,
  config,
  createAdminApp,
  createApp,
  Hono,
  loginAdmin,
  sharp,
  treeholeOperationsQuery,
  treeholeService,
} from './harness';

async function createImageBuffer(color: string) {
  return sharp({
    create: { width: 1_800, height: 1_200, channels: 3, background: color },
  }).jpeg({ quality: 92 }).toBuffer();
}

async function createAnimatedWebpBuffer() {
  const width = 24;
  const pageHeight = 18;
  const channels = 4;
  const first = Buffer.alloc(width * pageHeight * channels, 255);
  const second = Buffer.alloc(width * pageHeight * channels);
  for (let index = 0; index < second.length; index += 4) {
    second[index + 1] = 128;
    second[index + 3] = 255;
  }
  return sharp(Buffer.concat([first, second]), {
    raw: { width, height: pageHeight * 2, channels, pageHeight },
  }).webp({ loop: 0, delay: [100, 120] }).toBuffer();
}

async function storageEntries() {
  try {
    return await readdir(config.treehole.storageRoot);
  } catch (cause: any) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }
}

async function postForm(
  app: ReturnType<typeof createApp>,
  form: FormData,
  userId = authorId,
  studentId = '2023002001',
) {
  return app.request('http://localhost/api/treehole/posts', {
    method: 'POST',
    headers: await authHeaderFor(userId, studentId),
    body: form,
  });
}

async function waitForCount(read: () => number, expected: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (read() === expected) return;
    await Bun.sleep(1);
  }
  throw new Error(`等待计数达到 ${expected} 超时，当前为 ${read()}`);
}

function createTinyLimitApp() {
  const service = new Proxy({}, {
    get() {
      return async () => { throw new Error('上传事实门禁必须先于 application service 拒绝请求'); };
    },
  }) as any;
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('userId', 1);
    c.set('studentId', 'tiny-limit');
    c.set('name', '小边界测试');
    await next();
  });
  app.route('/api/treehole', createTreeholeRoutes(service, {
    maxImagesPerPost: 9,
    maxImageBytes: 4,
    maxImageTotalBytes: 5,
  }, new TreeholeUploadGate(1, 0)));
  return app;
}

describe('Treehole multipart 与低内存图片摄取', () => {
  it('文本帖也使用 multipart，旧 JSON 发帖被明确拒绝', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('content', '没有图片也必须走 multipart。');
    const response = await postForm(app, form);
    expect(response.status).toBe(201);
    const post = (await response.json() as any).data;
    expect(post.images).toEqual([]);
    expect(post.imageCount).toBe(0);

    const legacy = await app.request('http://localhost/api/treehole/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(authorId, '2023002001')),
      },
      body: JSON.stringify({ content: '旧 JSON 不再兼容。' }),
    });
    expect(legacy.status).toBe(400);
    expect((await legacy.json() as any).error_code).toBe(4002);
  });

  it('合并 images 与 images[] 并按表单顺序输出受限的静态 WebP', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('content', '两种图片字段名必须合并，顺序不能漂移。');
    form.append('images[]', new File([await createImageBuffer('#ff5533')], 'first.jpg', { type: 'image/jpeg' }));
    form.append('images', new File([await createImageBuffer('#3366ff')], 'second.jpg', { type: 'image/jpeg' }));
    const response = await postForm(app, form);
    expect(response.status).toBe(201);
    const post = (await response.json() as any).data;
    expect(post.imageCount).toBe(2);
    expect(post.images).toHaveLength(2);
    expect(post.images.map((image: any) => image.url.split('/').at(-1))).toEqual(['01.webp', '02.webp']);

    for (const image of post.images) {
      expect(image.mimeType).toBe('image/webp');
      expect(image.sizeBytes).toBeGreaterThan(0);
      expect(image.sizeBytes).toBeLessThanOrEqual(config.treehole.imageMaxOutputBytes);
      expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(config.treehole.imageMaxDimension);
      const relativePath = image.url.replace(`${config.treehole.userMediaBasePath}/`, '');
      const output = Bun.file(join(config.treehole.storageRoot, relativePath));
      expect(await output.exists()).toBe(true);
      const metadata = await sharp(Buffer.from(await output.arrayBuffer())).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.pages ?? 1).toBe(1);
    }
    const outputStats = await Promise.all(post.images.map(async (image: any) => {
      const relativePath = image.url.replace(`${config.treehole.userMediaBasePath}/`, '');
      return sharp(Buffer.from(await Bun.file(join(config.treehole.storageRoot, relativePath)).arrayBuffer())).stats();
    }));
    expect(outputStats[0].channels[0].mean).toBeGreaterThan(outputStats[0].channels[2].mean);
    expect(outputStats[1].channels[2].mean).toBeGreaterThan(outputStats[1].channels[0].mean);
  });

  it('锁定 12MiB/32MiB/33MiB 输入边界，并在解析前拒绝声明超限请求', async () => {
    expect(config.treehole.imageMaxBytes).toBe(12 * 1024 * 1024);
    expect(config.treehole.imageTotalMaxBytes).toBe(32 * 1024 * 1024);
    expect(config.treehole.imageMaxPixels).toBe(16_000_000);
    expect(config.treehole.imageMaxOutputBytes).toBe(1024 * 1024);
    expect(multipartRequestMaxBytes(config.treehole.imageTotalMaxBytes)).toBe(33 * 1024 * 1024);

    const app = createApp();
    const declared = await app.request('http://localhost/api/treehole/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=unused',
        'Content-Length': String(multipartRequestMaxBytes(config.treehole.imageTotalMaxBytes) + 1),
        ...(await authHeaderFor(authorId, '2023002001')),
      },
      body: '--unused--',
    });
    expect(declared.status).toBe(413);
    expect((await declared.json() as any).error_code).toBe(4002);

    // 用等价的小策略锁定单图/合计映射，避免为边界断言真的把几十 MiB 请求装进测试进程。
    const tinyApp = createTinyLimitApp();
    const oversized = new FormData();
    oversized.set('content', '单张图片超过原始字节上限。');
    oversized.append('images', new File(['12345'], 'oversized.png', { type: 'image/png' }));
    const single = await tinyApp.request('http://localhost/api/treehole/posts', {
      method: 'POST',
      body: oversized,
    });
    expect(single.status).toBe(413);
    expect((await single.json() as any).error_code).toBe(4002);

    const totalForm = new FormData();
    totalForm.set('content', '每张合法但图片合计超过原始字节上限。');
    totalForm.append('images', new File(['123'], 'first.png', { type: 'image/png' }));
    totalForm.append('images[]', new File(['456'], 'second.png', { type: 'image/png' }));
    const total = await tinyApp.request('http://localhost/api/treehole/posts', {
      method: 'POST',
      body: totalForm,
    });
    expect(total.status).toBe(413);
    expect((await total.json() as any).error_code).toBe(4002);

    const streamedRequest = new Request('http://localhost/api/treehole/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=streamed' },
      body: new Uint8Array(multipartRequestMaxBytes(5) + 1),
    });
    expect(streamedRequest.headers.has('content-length')).toBe(false);
    const streamed = await tinyApp.request(streamedRequest);
    expect(streamed.status).toBe(413);
    expect((await streamed.json() as any).error_code).toBe(4002);
  });

  it('拒绝第十张图片、伪图片和动图，失败批次不创建帖子也不留下媒体目录', async () => {
    const app = createApp();
    const tiny = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#ffffff' },
    }).png().toBuffer();
    const tooMany = new FormData();
    tooMany.set('content', '图片数量必须先于压缩被拒绝。');
    for (let index = 0; index < 10; index += 1) {
      tooMany.append('images', new File([tiny], `${index}.png`, { type: 'image/png' }));
    }
    expect((await postForm(app, tooMany)).status).toBe(400);

    const invalidSecond = new FormData();
    invalidSecond.set('content', '第二张失败时第一张也不能发布。');
    invalidSecond.append('images', new File([await createImageBuffer('#11aa66')], 'valid.jpg', { type: 'image/jpeg' }));
    invalidSecond.append('images[]', new File(['not-an-image'], 'fake.jpg', { type: 'image/jpeg' }));
    expect((await postForm(app, invalidSecond)).status).toBe(400);
    expect(await storageEntries()).toEqual([]);

    const animated = new FormData();
    animated.set('content', '小内存策略拒绝所有动图。');
    animated.append('images', new File(
      [await createAnimatedWebpBuffer()],
      'animated.webp',
      { type: 'image/webp' },
    ));
    expect((await postForm(app, animated)).status).toBe(400);
    expect(await storageEntries()).toEqual([]);

    const list = await app.request('http://localhost/api/treehole/posts', {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect((await list.json() as any).data.total).toBe(0);
  });

  it('数据库写入失败会补偿整个已压缩批次', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('content', 'SQLite 中止帖子事实写入后必须补偿候选媒体。');
    form.append('images', new File([await createImageBuffer('#aa44cc')], 'candidate.jpg', { type: 'image/jpeg' }));

    const triggerDatabase = new Database(config.dbPath);
    let response: Response;
    try {
      triggerDatabase.exec(`
        CREATE TRIGGER fail_treehole_post_insert
        BEFORE INSERT ON treehole_posts
        BEGIN
          SELECT RAISE(ABORT, 'forced treehole post failure');
        END;
      `);
      response = await postForm(app, form);
    } finally {
      triggerDatabase.exec('DROP TRIGGER IF EXISTS fail_treehole_post_insert');
      triggerDatabase.close();
    }
    expect(response!.status).toBe(500);
    expect(await storageEntries()).toEqual([]);
    const list = await app.request('http://localhost/api/treehole/posts', {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect((await list.json() as any).data.total).toBe(0);
  });

  it('上传门禁只允许一个 active 和两个 queued，并按 FIFO 释放', async () => {
    const gate = new TreeholeUploadGate(1, 2);
    const first = await gate.acquire();
    expect(first).not.toBeNull();
    const order: number[] = [];
    const secondPromise = gate.acquire().then((lease) => {
      order.push(2);
      return lease;
    });
    const thirdPromise = gate.acquire().then((lease) => {
      order.push(3);
      return lease;
    });
    expect(await gate.acquire()).toBeNull();
    await Promise.resolve();
    expect(order).toEqual([]);

    first!();
    const second = await secondPromise;
    expect(order).toEqual([2]);
    second!();
    const third = await thirdPromise;
    expect(order).toEqual([2, 3]);
    third!();
  });

  it('压缩队列已满时 HTTP 立即返回 429，排队请求仍依次完成', async () => {
    let started = 0;
    const complete: Array<() => void> = [];
    const service = new Proxy({}, {
      get(_target, property) {
        if (property !== 'createPost') {
          return async () => { throw new Error(`意外调用 Treehole service.${String(property)}`); };
        }
        return () => new Promise((resolve) => {
          started += 1;
          const id = started;
          complete.push(() => resolve({ id, imageCount: 0 }));
        });
      },
    }) as any;
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('userId', 1);
      c.set('studentId', 'queue-test');
      c.set('name', '队列测试');
      await next();
    });
    app.route('/api/treehole', createTreeholeRoutes(service, {
      maxImagesPerPost: 9,
      maxImageBytes: 4,
      maxImageTotalBytes: 5,
    }, new TreeholeUploadGate(1, 2)));
    const request = () => {
      const form = new FormData();
      form.set('content', '排队发帖');
      return app.request('http://localhost/api/treehole/posts', { method: 'POST', body: form });
    };

    const first = request();
    await waitForCount(() => started, 1);
    const second = request();
    const third = request();
    await Bun.sleep(1);
    const rejected = await request();
    expect(rejected.status).toBe(429);
    expect((await rejected.json() as any).error_code).toBe(4002);

    complete.shift()!();
    expect((await first).status).toBe(201);
    await waitForCount(() => started, 2);
    complete.shift()!();
    expect((await second).status).toBe(201);
    await waitForCount(() => started, 3);
    complete.shift()!();
    expect((await third).status).toBe(201);
  });
});

describe('Treehole 私有媒体授权与生命周期', () => {
  it('用户媒体要求 Bearer，管理媒体要求 Cookie，软删除后两者均返回 404', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('content', '图片只对已认证校园用户与管理员开放。');
    form.append('images', new File([await createImageBuffer('#2288aa')], 'private.jpg', { type: 'image/jpeg' }));
    const createdResponse = await postForm(app, form);
    const created = (await createdResponse.json() as any).data;
    const userUrl = created.images[0].url as string;

    expect((await app.request(`http://localhost${userUrl}`)).status).toBe(401);
    const userMedia = await app.request(`http://localhost${userUrl}`, {
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(userMedia.status).toBe(200);
    expect(userMedia.headers.get('content-type')).toContain('image/webp');
    expect(userMedia.headers.get('cache-control')).toBe('private, no-store');
    expect(userMedia.headers.get('x-content-type-options')).toBe('nosniff');

    const adminList = await treeholeOperationsQuery.listPosts({ page: 1, pageSize: 10 });
    const adminUrl = adminList.items[0]!.images[0]!.url;
    expect(adminUrl.startsWith(config.treehole.adminMediaBasePath)).toBe(true);
    const adminApp = createAdminApp();
    expect((await adminApp.request(`http://localhost${adminUrl}`)).status).toBe(401);
    const cookie = await loginAdmin(adminApp);
    const adminMedia = await adminApp.request(`http://localhost${adminUrl}`, {
      headers: { Cookie: cookie },
    });
    expect(adminMedia.status).toBe(200);
    expect(adminMedia.headers.get('cache-control')).toBe('private, no-store');

    const [mediaKey] = userUrl.replace(`${config.treehole.userMediaBasePath}/`, '').split('/');
    expect((await app.request(
      `http://localhost${config.treehole.userMediaBasePath}/${mediaKey}/10.webp`,
      { headers: await authHeaderFor(authorId, '2023002001') },
    )).status).toBe(404);
    expect((await app.request(
      `http://localhost${config.treehole.userMediaBasePath}/not-a-uuid/01.webp`,
      { headers: await authHeaderFor(authorId, '2023002001') },
    )).status).toBe(404);

    const removed = await app.request(`http://localhost/api/treehole/posts/${created.id}`, {
      method: 'DELETE',
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(removed.status).toBe(200);
    expect((await app.request(`http://localhost${userUrl}`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    })).status).toBe(404);
    expect((await adminApp.request(`http://localhost${adminUrl}`, {
      headers: { Cookie: cookie },
    })).status).toBe(404);
  });

  it('孤儿回收只删除超过宽限期且没有活跃帖子引用的严格 UUID 目录', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('content', '这张图片仍有活跃引用。');
    form.append('images', new File([await createImageBuffer('#ffaa00')], 'active.jpg', { type: 'image/jpeg' }));
    const created = (await (await postForm(app, form)).json() as any).data;
    const activeKey = created.images[0].url
      .replace(`${config.treehole.userMediaBasePath}/`, '')
      .split('/')[0];
    const oldOrphanKey = '22222222-2222-4222-8222-222222222222';
    const freshOrphanKey = '33333333-3333-4333-8333-333333333333';
    const ignoredDirectory = join(config.treehole.storageRoot, 'not-a-media-key');
    const oldOrphanDirectory = join(config.treehole.storageRoot, oldOrphanKey);
    const freshOrphanDirectory = join(config.treehole.storageRoot, freshOrphanKey);
    await Promise.all([
      mkdir(oldOrphanDirectory, { recursive: true }),
      mkdir(freshOrphanDirectory, { recursive: true }),
      mkdir(ignoredDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(oldOrphanDirectory, '01.webp'), 'old'),
      writeFile(join(freshOrphanDirectory, '01.webp'), 'fresh'),
      writeFile(join(ignoredDirectory, '01.webp'), 'ignored'),
    ]);
    const now = Date.now();
    const old = new Date(now - 2 * config.treehole.orphanMediaGraceMs);
    await utimes(oldOrphanDirectory, old, old);
    await utimes(ignoredDirectory, old, old);

    await expect(treeholeService.cleanupOrphanMedia(
      new Date(now - config.treehole.orphanMediaGraceMs),
    )).resolves.toBe(1);
    expect(await Bun.file(join(config.treehole.storageRoot, activeKey, '01.webp')).exists()).toBe(true);
    expect(await Bun.file(join(oldOrphanDirectory, '01.webp')).exists()).toBe(false);
    expect(await Bun.file(join(freshOrphanDirectory, '01.webp')).exists()).toBe(true);
    expect(await Bun.file(join(ignoredDirectory, '01.webp')).exists()).toBe(true);
  });
});
