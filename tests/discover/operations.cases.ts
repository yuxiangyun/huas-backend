/**
 * [INPUT]: 依赖 Discover 测试支架、后台会话、媒体访问与 UGC 合规运行态
 * [OUTPUT]: 验证管理删除、默认拒绝与合规热切换下的读写边界
 * [POS]: tests/discover 的 Discover 管理与合规读模型细分用例，失败时直接定位该业务能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  authorId,
  otherAuthorId,
  raterId,
  createApp,
  createImageBuffer,
  authHeaderFor,
  adminSessionHeader,
  createDiscoverPost,
  createDiscoverComment,
  eq,
  getDb,
  schema,
  config,
  DISCOVER_MEDIA_CACHE_CONTROL,
} from './harness';

describe('Discover 管理与合规读模型', () => {
  it('管理员删除帖子后，帖子不再出现在公共列表且图片不可再访问', async () => {
    const app = createApp();
    const form = new FormData();
    form.set('category', '1食堂');
    form.set('title', '番茄鸡排饭');
    form.set('storeName', '一食堂快餐档');
    form.set('priceText', '14元');
    form.set('content', '味道稳定，鸡排现炸，番茄汁偏甜，适合不想吃辣的时候。');
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
    expect(mediaBeforeDelete.headers.get('cache-control')).toBe(DISCOVER_MEDIA_CACHE_CONTROL);
    expect(await Bun.file(filePath).exists()).toBe(true);

    const deleteRes = await app.request(`http://localhost/api/admin/discover/posts/${postId}`, {
      method: 'DELETE',
      headers: await adminSessionHeader(app),
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

  it('管理凭据配置缺失时默认拒绝访问', async () => {
    const app = createApp();
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;

    try {
      delete process.env.ADMIN_USERNAME;
      const missingUsernameRes = await app.request('http://localhost/api/admin/compliance/ugc', {
        headers: await adminSessionHeader(app),
      });
      expect(missingUsernameRes.status).toBe(401);

      process.env.ADMIN_USERNAME = username;
      delete process.env.ADMIN_PASSWORD;
      const missingPasswordRes = await app.request('http://localhost/api/admin/compliance/ugc', {
        headers: await adminSessionHeader(app),
      });
      expect(missingPasswordRes.status).toBe(401);
    } finally {
      process.env.ADMIN_USERNAME = username;
      process.env.ADMIN_PASSWORD = password;
    }
  });

  it('管理接口热开启 UGC 合规后，Discover GET 返回纯文本 mock 或空态，写操作继续可用', async () => {
    const app = createApp();
    const authorHeaders = await authHeaderFor(authorId, '2023001001');

    const initialState = await app.request('http://localhost/api/admin/compliance/ugc', {
      headers: await adminSessionHeader(app),
    });
    expect(initialState.status).toBe(200);
    const initialStateBody = await initialState.json() as any;
    expect(initialStateBody.data.mode).toBe('normal');
    expect(initialStateBody.data.discoverMockText).toBe('');
    expect(initialStateBody.data.treeholeMockText).toBe('');

    const enableRes = await app.request('http://localhost/api/admin/compliance/ugc', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...await adminSessionHeader(app),
      },
      body: JSON.stringify({ mode: 'compliance' }),
    });
    expect(enableRes.status).toBe(200);
    const enableBody = await enableRes.json() as any;
    expect(enableBody.data.mode).toBe('compliance');
    expect(enableBody.data.discoverMockText).toBe('');

    const unauthenticatedList = await app.request('http://localhost/api/discover/posts');
    expect(unauthenticatedList.status).toBe(401);

    const metaRes = await app.request('http://localhost/api/discover/meta', {
      headers: authorHeaders,
    });
    expect(metaRes.status).toBe(200);
    const metaBody = await metaRes.json() as any;
    expect(metaBody.data.categories.length).toBeGreaterThan(0);

    const post = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '合规开关写入测试',
      color: '#dd8844',
    });
    await createDiscoverComment(app, {
      postId: post.id,
      userId: otherAuthorId,
      studentId: '2023001002',
      content: '开关打开时评论写入仍可用',
    });

    const listRes = await app.request('http://localhost/api/discover/posts?page=2&pageSize=7', {
      headers: authorHeaders,
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    expect(listBody.data).toEqual({
      items: [],
      page: 2,
      pageSize: 7,
      total: 0,
      hasMore: false,
    });

    const mockRes = await app.request('http://localhost/api/admin/compliance/ugc', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...await adminSessionHeader(app),
      },
      body: JSON.stringify({
        mode: 'compliance',
        discoverMockText: '当前内容维护中\n请稍后再来<script>',
        treeholeMockText: '树洞不应该影响分享美食',
      }),
    });
    expect(mockRes.status).toBe(200);
    const mockBody = await mockRes.json() as any;
    expect(mockBody.data.discoverMockText).toBe('当前内容维护中\n请稍后再来script');
    expect(mockBody.data.treeholeMockText).toBe('树洞不应该影响分享美食');

    const mockListRes = await app.request('http://localhost/api/discover/posts?page=1&pageSize=7', {
      headers: authorHeaders,
    });
    expect(mockListRes.status).toBe(200);
    const mockListBody = await mockListRes.json() as any;
    expect(mockListBody.data.total).toBe(1);
    expect(mockListBody.data.items[0].id).toBe(0);
    expect(mockListBody.data.items[0].content).toBe('当前内容维护中\n请稍后再来script');
    expect(mockListBody.data.items[0].images).toEqual([]);

    const myListRes = await app.request('http://localhost/api/discover/posts/me?page=3&pageSize=5', {
      headers: authorHeaders,
    });
    expect(myListRes.status).toBe(200);
    const myListBody = await myListRes.json() as any;
    expect(myListBody.data.items).toEqual([]);
    expect(myListBody.data.page).toBe(3);
    expect(myListBody.data.pageSize).toBe(5);

    const commentsRes = await app.request(`http://localhost/api/discover/posts/${post.id}/comments?page=4&pageSize=9`, {
      headers: authorHeaders,
    });
    expect(commentsRes.status).toBe(200);
    const commentsBody = await commentsRes.json() as any;
    expect(commentsBody.data).toEqual({
      items: [],
      page: 4,
      pageSize: 9,
      total: 0,
      hasMore: false,
    });

    const detailRes = await app.request(`http://localhost/api/discover/posts/${post.id}`, {
      headers: authorHeaders,
    });
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json() as any;
    expect(detailBody.data).toBeNull();

    const disableRes = await app.request('http://localhost/api/admin/compliance/ugc', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...await adminSessionHeader(app),
      },
      body: JSON.stringify({ mode: 'normal' }),
    });
    expect(disableRes.status).toBe(200);
    expect((await disableRes.json() as any).data.mode).toBe('normal');

    const restoredListRes = await app.request('http://localhost/api/discover/posts?sort=latest', {
      headers: authorHeaders,
    });
    expect(restoredListRes.status).toBe(200);
    const restoredListBody = await restoredListRes.json() as any;
    expect(restoredListBody.data.total).toBe(1);
    expect(restoredListBody.data.items[0].id).toBe(post.id);
  });
});
