/**
 * [INPUT]: 依赖 Discover 测试支架、帖子/评分 API 与查询夹具
 * [OUTPUT]: 验证评分聚合、高分排序、冷启动与推荐排除规则
 * [POS]: tests/discover 的 Discover 评分与推荐细分用例，失败时直接定位该业务能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  authorId,
  otherAuthorId,
  raterId,
  createApp,
  createImageBuffer,
  authHeaderFor,
} from './harness';

describe('Discover 评分与推荐', () => {
  it('评分会更新平均分，高分列表与推荐列表按 discover 逻辑工作', async () => {
    const app = createApp();

    async function createPost(
      userId: number,
      studentId: string,
      title: string,
      category: string,
      tags: string[],
      color: string
    ) {
      const form = new FormData();
      form.set('category', category);
      form.set('title', title);
      form.set('storeName', '测试档口');
      form.set('priceText', '15元');
      form.set('content', `${title} 很下饭，分量稳定，愿意回头再吃。`);
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

    async function createPost(
      userId: number,
      studentId: string,
      title: string,
      tags: string[],
      color: string
    ) {
      const form = new FormData();
      form.set('category', '其他');
      form.set('title', title);
      form.set('storeName', '测试档口');
      form.set('priceText', '11元');
      form.set('content', `${title} 有明显口味特点，适合推荐给别人。`);
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
});
