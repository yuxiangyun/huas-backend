/**
 * [INPUT]: 依赖 Discover 测试支架、注入式模块、Operations query、点赞与媒体访问
 * [OUTPUT]: 验证管理只读快照采用点赞口径，以及管理删除后公共事实和媒体同步失效
 * [POS]: tests/discover 的 Discover Operations 端口细分用例，不经过根 Operations composition
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  authorId,
  likerId,
  createApp,
  createDiscoverPost,
  createTestDiscoverModule,
  authHeaderFor,
  eq,
  getDb,
  schema,
  config,
  DISCOVER_MEDIA_CACHE_CONTROL,
} from './harness';

describe('Discover Operations 边界', () => {
  it('快照统计点赞且管理删除后帖子与媒体不可见', async () => {
    const module = createTestDiscoverModule();
    const app = createApp(module);
    const post = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '番茄鸡排饭',
      category: '1食堂',
      tags: ['好吃'],
      color: '#44aa66',
    });
    const imageUrl = `http://localhost${post.images[0].url}`;
    const relativePath = post.images[0].url.replace(`${config.discover.mediaBasePath}/`, '');
    const filePath = join(config.discover.storageRoot, relativePath);

    const likeResponse = await app.request(`http://localhost/api/discover/posts/${post.id}/like`, {
      method: 'PUT',
      headers: await authHeaderFor(likerId, '2023001003'),
    });
    expect(likeResponse.status).toBe(200);

    const snapshot = await module.operationsQuery.getSnapshot(20);
    expect(snapshot.totalPosts).toBe(1);
    expect(snapshot.totalLikes).toBe(1);
    expect(snapshot.items[0].likeCount).toBe(1);
    expect(snapshot.items[0].authorDisplayName).toBe(`软件工程同学${authorId}`);
    const mediaBeforeDelete = await app.request(imageUrl);
    expect(mediaBeforeDelete.status).toBe(200);
    expect(mediaBeforeDelete.headers.get('cache-control')).toBe(DISCOVER_MEDIA_CACHE_CONTROL);
    expect(await Bun.file(filePath).exists()).toBe(true);

    await expect(module.service.deletePost(post.id)).resolves.toEqual({ id: post.id });

    const listResponse = await app.request('http://localhost/api/discover/posts?sort=latest', {
      headers: await authHeaderFor(likerId, '2023001003'),
    });
    expect((await listResponse.json() as any).data.items).toHaveLength(0);
    expect((await app.request(imageUrl)).status).toBe(404);
    expect(await Bun.file(filePath).exists()).toBe(false);

    const rows = await getDb().select({ deletedAt: schema.discoverPosts.deletedAt })
      .from(schema.discoverPosts)
      .where(eq(schema.discoverPosts.id, post.id));
    expect(rows[0].deletedAt).toBeTruthy();
  });
});
