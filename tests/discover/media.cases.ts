/**
 * [INPUT]: 依赖 Discover 媒体测试支架与图片编码能力
 * [OUTPUT]: 验证发帖媒体压缩、HEIF/HEIC、大图、动图处理与引用/宽限期孤儿目录回收契约
 * [POS]: tests/discover 的 Discover 媒体摄取与规范化细分用例，失败时直接定位该业务能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  authorId,
  OLD_DISCOVER_IMAGE_LIMIT_BYTES,
  createApp,
  createImageBuffer,
  createLargePhoneImageBuffer,
  createHeifFamilyBuffer,
  createRealHeicBuffer,
  createAnimatedWebpBuffer,
  authHeaderFor,
  sharp,
  config,
  createDiscoverPost,
  createTestDiscoverModule,
} from './harness';

describe('Discover 媒体摄取与规范化', () => {
  it('只清理超过宽限期且未被有效帖子引用的 UUID 媒体目录', async () => {
    const module = createTestDiscoverModule();
    const app = createApp(module);
    const active = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '仍被引用的媒体',
    });
    const activeStorageKey = active.images[0].url
      .replace(`${config.discover.mediaBasePath}/`, '')
      .split('/')[0];
    const oldOrphanKey = '22222222-2222-4222-8222-222222222222';
    const freshOrphanKey = '33333333-3333-4333-8333-333333333333';
    const oldOrphanDir = join(config.discover.storageRoot, oldOrphanKey);
    const freshOrphanDir = join(config.discover.storageRoot, freshOrphanKey);
    const oldOrphanFile = join(oldOrphanDir, '01.webp');
    const freshOrphanFile = join(freshOrphanDir, '01.webp');
    await Promise.all([
      mkdir(oldOrphanDir, { recursive: true }),
      mkdir(freshOrphanDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(oldOrphanFile, 'old-orphan'),
      writeFile(freshOrphanFile, 'fresh-orphan'),
    ]);
    const now = Date.now();
    const old = new Date(now - 2 * 60 * 60 * 1000);
    await utimes(oldOrphanDir, old, old);

    await expect(module.service.cleanupOrphanMedia(new Date(now - 60 * 60 * 1000))).resolves.toBe(1);
    expect(await Bun.file(join(config.discover.storageRoot, activeStorageKey, '01.webp')).exists()).toBe(true);
    expect(await Bun.file(oldOrphanFile).exists()).toBe(false);
    expect(await Bun.file(freshOrphanFile).exists()).toBe(true);
  });

  it('发帖后直接发布，图片压缩为单份 webp，并可在我的帖子中看到', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('category', '其他');
    form.set('title', '红油牛肉粉');
    form.set('storeName', '二楼川味档');
    form.set('priceText', '12元');
    form.set('content', '汤底够辣，牛肉给得不少，午高峰要稍微等一会。');
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
    expect(body.data.storeName).toBe('二楼川味档');
    expect(body.data.priceText).toBe('12元');
    expect(body.data.content).toContain('牛肉给得不少');
    expect(body.data.tags).toEqual(['辣', '便宜']);
    expect(body.data.images).toHaveLength(1);
    expect(body.data.images[0].url.endsWith('.webp')).toBe(true);
    expect(body.data.author).toEqual({
      id: authorId,
      displayName: `软件工程同学${authorId}`,
      avatarUrl: null,
    });
    expect(body.data.likeCount).toBe(0);
    expect(body.data.likedByMe).toBe(false);

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

  it('支持 HEIF 家族图片，即使移动端没有带标准 MIME 也能上传', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('category', '其他');
    form.set('title', 'HEIC 手机图');
    form.set('storeName', '移动端测试');
    form.set('priceText', '13元');
    form.set('content', '这是一张来自手机相册的高效格式图片，应该能正常上传和转码。');
    form.append('tags', '清晰');
    form.append('images', new File([await createHeifFamilyBuffer('#33aaff')], 'mobile.heic'));

    const res = await app.request('http://localhost/api/discover/posts', {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023001001'),
      body: form,
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.images).toHaveLength(1);
    expect(body.data.images[0].mimeType).toBe('image/webp');
    expect(body.data.images[0].url.endsWith('.webp')).toBe(true);

    const relativePath = body.data.images[0].url.replace(`${config.discover.mediaBasePath}/`, '');
    const output = Buffer.from(await Bun.file(join(config.discover.storageRoot, relativePath)).arrayBuffer());
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
  });

  it('支持超过旧 8MB 的手机原图并压缩为单份 webp', async () => {
    const app = createApp();
    const source = await createLargePhoneImageBuffer();
    expect(source.byteLength).toBeGreaterThan(OLD_DISCOVER_IMAGE_LIMIT_BYTES);
    expect(source.byteLength).toBeLessThanOrEqual(config.discover.imageMaxBytes);

    const form = new FormData();
    form.set('category', '其他');
    form.set('title', '大图压缩测试');
    form.set('storeName', '手机相册');
    form.set('priceText', '18元');
    form.set('content', '这是一张超过旧限制的手机原图，后端应该先接收再压缩成 WebP。');
    form.append('tags', '清晰');
    form.append('images', new File([source], 'large-phone.png', { type: 'image/png' }));

    const res = await app.request('http://localhost/api/discover/posts', {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023001001'),
      body: form,
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.images).toHaveLength(1);
    expect(body.data.images[0].mimeType).toBe('image/webp');
    expect(body.data.images[0].sizeBytes).toBeLessThan(source.byteLength);

    const relativePath = body.data.images[0].url.replace(`${config.discover.mediaBasePath}/`, '');
    const output = Buffer.from(await Bun.file(join(config.discover.storageRoot, relativePath)).arrayBuffer());
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('webp');
    expect(Math.max(metadata.width || 0, metadata.height || 0)).toBeLessThanOrEqual(config.discover.imageMaxDimension);
  });

  it('支持真实 HEIC 文件并统一转为 webp', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('category', '其他');
    form.set('title', '真实 HEIC 样例');
    form.set('storeName', '手机相册');
    form.set('priceText', '16元');
    form.set('content', '使用测试夹具中的真实 HEIC 文件，验证服务端能正常转码并返回 webp。');
    form.append('tags', 'HEIC');
    form.append('images', new File([await createRealHeicBuffer()], 'iphone.heic', { type: 'application/octet-stream' }));

    const res = await app.request('http://localhost/api/discover/posts', {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023001001'),
      body: form,
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.images).toHaveLength(1);
    expect(body.data.images[0].mimeType).toBe('image/webp');
    expect(body.data.images[0].url.endsWith('.webp')).toBe(true);

    const relativePath = body.data.images[0].url.replace(`${config.discover.mediaBasePath}/`, '');
    const output = Buffer.from(await Bun.file(join(config.discover.storageRoot, relativePath)).arrayBuffer());
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
  });

  it('上传动图时会保留动画帧并转为 animated webp', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('category', '其他');
    form.set('title', '会动的图');
    form.set('storeName', '动图测试');
    form.set('priceText', '14元');
    form.set('content', '动图上传后不应该被压成静态首帧。');
    form.append('tags', '动图');
    form.append('images', new File([await createAnimatedWebpBuffer()], 'animated.webp', { type: 'image/webp' }));

    const res = await app.request('http://localhost/api/discover/posts', {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023001001'),
      body: form,
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.images[0].mimeType).toBe('image/webp');

    const relativePath = body.data.images[0].url.replace(`${config.discover.mediaBasePath}/`, '');
    const output = Buffer.from(await Bun.file(join(config.discover.storageRoot, relativePath)).arrayBuffer());
    const metadata = await sharp(output, { animated: true, pages: -1 }).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.pages).toBeGreaterThan(1);
    expect(Array.isArray(metadata.delay)).toBe(true);
    expect(metadata.delay?.length).toBeGreaterThan(1);
    expect(metadata.pageHeight).toBeGreaterThan(0);
  });
});
