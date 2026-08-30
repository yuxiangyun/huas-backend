/**
 * [INPUT]: 依赖 Discover 测试支架、帖子/点赞/列表/用户帖子 API、SQLite 事实与 Notifications 投影表
 * [OUTPUT]: 验证幂等点赞/作者自赞/通知撤销、popular、完整候选集稳定推荐、Unicode 校验及统一作者 DTO
 * [POS]: tests/discover 的 Discover 点赞与推荐细分用例，锁定事实/Outbox/通知一致性与点赞推荐契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { normalizeCommentContent, normalizeContent } from '../../src/modules/discover/domain/discover';
import {
  authorId,
  otherAuthorId,
  likerId,
  createApp,
  createDiscoverPost,
  createUser,
  setCommunityProfile,
  authHeaderFor,
  eq,
  getDb,
  schema,
} from './harness';

describe('Discover 点赞与推荐', () => {
  it('点赞/取消点赞幂等、计数一致，并允许作者点赞自己的帖子', async () => {
    const app = createApp();
    const post = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '幂等点赞测试',
    });

    const selfLike = await app.request(`http://localhost/api/discover/posts/${post.id}/like`, {
      method: 'PUT',
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(selfLike.status).toBe(200);
    expect((await selfLike.json() as any).data).toEqual({
      postId: post.id,
      liked: true,
      likeCount: 1,
    });

    const selfRelike = await app.request(`http://localhost/api/discover/posts/${post.id}/like`, {
      method: 'PUT',
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(selfRelike.status).toBe(200);
    expect((await selfRelike.json() as any).data).toEqual({
      postId: post.id,
      liked: true,
      likeCount: 1,
    });
    expect(await getDb().select().from(schema.notifications)
      .where(eq(schema.notifications.resourceId, post.id))).toHaveLength(0);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.request(`http://localhost/api/discover/posts/${post.id}/like`, {
        method: 'PUT',
        headers: await authHeaderFor(likerId, '2023001003'),
      });
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(body.data).toEqual({ postId: post.id, liked: true, likeCount: 2 });
    }

    const likes = await getDb().select().from(schema.discoverPostLikes)
      .where(eq(schema.discoverPostLikes.postId, post.id));
    const posts = await getDb().select({ likeCount: schema.discoverPosts.likeCount })
      .from(schema.discoverPosts)
      .where(eq(schema.discoverPosts.id, post.id));
    expect(likes).toHaveLength(2);
    expect(posts[0].likeCount).toBe(2);
    const projectedLikes = await getDb().select().from(schema.notifications)
      .where(eq(schema.notifications.resourceId, post.id));
    expect(projectedLikes).toHaveLength(1);
    expect(projectedLikes[0]).toMatchObject({
      recipientUserId: authorId,
      actorUserId: likerId,
      type: 'discover_like',
      resourceType: 'discover_post',
      subresourceId: null,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.request(`http://localhost/api/discover/posts/${post.id}/like`, {
        method: 'DELETE',
        headers: await authHeaderFor(likerId, '2023001003'),
      });
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(body.data).toEqual({ postId: post.id, liked: false, likeCount: 1 });
    }

    expect(await getDb().select().from(schema.discoverPostLikes)
      .where(eq(schema.discoverPostLikes.postId, post.id))).toHaveLength(1);
    const selfUnlike = await app.request(`http://localhost/api/discover/posts/${post.id}/like`, {
      method: 'DELETE',
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(selfUnlike.status).toBe(200);
    expect((await selfUnlike.json() as any).data).toEqual({
      postId: post.id,
      liked: false,
      likeCount: 0,
    });
    const selfUnlikeAgain = await app.request(`http://localhost/api/discover/posts/${post.id}/like`, {
      method: 'DELETE',
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(selfUnlikeAgain.status).toBe(200);
    expect((await selfUnlikeAgain.json() as any).data).toEqual({
      postId: post.id,
      liked: false,
      likeCount: 0,
    });
    expect(await getDb().select().from(schema.discoverPostLikes)
      .where(eq(schema.discoverPostLikes.postId, post.id))).toHaveLength(0);
    expect(await getDb().select().from(schema.notifications)
      .where(eq(schema.notifications.resourceId, post.id))).toHaveLength(0);
    expect(await getDb().select().from(schema.activityOutbox)).toHaveLength(0);

    const reLike = await app.request(`http://localhost/api/discover/posts/${post.id}/like`, {
      method: 'PUT',
      headers: await authHeaderFor(likerId, '2023001003'),
    });
    expect(reLike.status).toBe(200);
    expect(await getDb().select().from(schema.notifications)
      .where(eq(schema.notifications.resourceId, post.id))).toHaveLength(1);
  });

  it('popular 严格按 likeCount、publishedAt、id 排序', async () => {
    const app = createApp();
    const popular = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '点赞更多但更早',
    });
    const recent = await createDiscoverPost(app, {
      userId: otherAuthorId,
      studentId: '2023001002',
      title: '点赞较少但更新',
    });
    const newest = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '同点赞数但最新',
    });

    for (const [userId, studentId, postId] of [
      [otherAuthorId, '2023001002', popular.id],
      [likerId, '2023001003', popular.id],
      [authorId, '2023001001', recent.id],
      [otherAuthorId, '2023001002', newest.id],
    ] as const) {
      const response = await app.request(`http://localhost/api/discover/posts/${postId}/like`, {
        method: 'PUT',
        headers: await authHeaderFor(userId, studentId),
      });
      expect(response.status).toBe(200);
    }

    const response = await app.request('http://localhost/api/discover/posts?sort=popular', {
      headers: await authHeaderFor(likerId, '2023001003'),
    });
    expect(response.status).toBe(200);
    const items = (await response.json() as any).data.items;
    expect(items.map((item: any) => item.id)).toEqual([popular.id, newest.id, recent.id]);
    expect(items.map((item: any) => item.likeCount)).toEqual([2, 1, 1]);
  });

  it('recommended 无点赞偏好时等同 latest，有偏好后按点赞过帖子的分类和标签推断', async () => {
    const app = createApp();
    const fourthUserId = await createUser('2023001004', '电子信息2401班');
    const preferredSource = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '香辣源帖子',
      category: '1食堂',
      tags: ['辣', '下饭'],
    });
    const unmatched = await createDiscoverPost(app, {
      userId: otherAuthorId,
      studentId: '2023001002',
      title: '清淡候选',
      category: '2食堂',
      tags: ['清淡'],
    });
    const preferredCandidate = await createDiscoverPost(app, {
      userId: fourthUserId,
      studentId: '2023001004',
      title: '香辣候选',
      category: '1食堂',
      tags: ['辣', '下饭'],
    });

    const latestResponse = await app.request('http://localhost/api/discover/posts?sort=latest', {
      headers: await authHeaderFor(likerId, '2023001003'),
    });
    const coldResponse = await app.request('http://localhost/api/discover/posts?sort=recommended', {
      headers: await authHeaderFor(likerId, '2023001003'),
    });
    const latestIds = (await latestResponse.json() as any).data.items.map((item: any) => item.id);
    const coldIds = (await coldResponse.json() as any).data.items.map((item: any) => item.id);
    expect(coldIds).toEqual(latestIds);

    const likeResponse = await app.request(`http://localhost/api/discover/posts/${preferredSource.id}/like`, {
      method: 'PUT',
      headers: await authHeaderFor(likerId, '2023001003'),
    });
    expect(likeResponse.status).toBe(200);

    const recommendedResponse = await app.request('http://localhost/api/discover/posts?sort=recommended', {
      headers: await authHeaderFor(likerId, '2023001003'),
    });
    const recommendedIds = (await recommendedResponse.json() as any).data.items.map((item: any) => item.id);
    expect(recommendedIds.slice(0, 2)).toEqual([preferredSource.id, preferredCandidate.id]);
    expect(recommendedIds).not.toContain(unmatched.id);
  });

  it('recommended 对完整匹配集稳定分页并可访问 400 条之后的结果', async () => {
    const app = createApp();
    const preferredSource = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '完整候选集偏好源',
      category: '1食堂',
      tags: ['辣'],
    });
    const likeResponse = await app.request(`http://localhost/api/discover/posts/${preferredSource.id}/like`, {
      method: 'PUT',
      headers: await authHeaderFor(likerId, '2023001003'),
    });
    expect(likeResponse.status).toBe(200);

    const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
    const rows = Array.from({ length: 405 }, (_, index) => {
      const at = new Date(baseTime + index * 1_000);
      const storageKey = `candidate-${index}`;
      return {
        userId: authorId,
        title: `推荐候选-${index}`,
        storeName: '候选档口',
        priceText: '10元',
        content: `候选内容-${index}`,
        category: '1食堂',
        storageKey,
        imagesJson: JSON.stringify([]),
        tagsJson: JSON.stringify(index === 205 ? ['辣'] : ['普通']),
        coverUrl: `/media/discover/${storageKey}/01.webp`,
        imageCount: 0,
        commentCount: 0,
        likeCount: 0,
        createdAt: at,
        updatedAt: at,
        publishedAt: at,
        deletedAt: null,
      };
    });
    for (let start = 0; start < rows.length; start += 30) {
      await getDb().insert(schema.discoverPosts).values(rows.slice(start, start + 30));
    }

    const requestPage = async (page: number) => {
      const response = await app.request(
        `http://localhost/api/discover/posts?sort=recommended&page=${page}&pageSize=50`,
        { headers: await authHeaderFor(likerId, '2023001003') },
      );
      expect(response.status).toBe(200);
      return (await response.json() as any).data;
    };
    const [first, second, tail] = await Promise.all([
      requestPage(1),
      requestPage(2),
      requestPage(9),
    ]);

    expect(first.total).toBe(406);
    expect(second.total).toBe(406);
    expect(tail.total).toBe(406);
    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(50);
    expect(tail.items).toHaveLength(6);
    const firstIds = new Set(first.items.map((item: any) => item.id));
    expect(second.items.some((item: any) => firstIds.has(item.id))).toBe(false);
  });

  it('内容与评论长度按 Unicode code point 计算', () => {
    const policy = {
      maxImagesPerPost: 9,
      maxTagsPerPost: 6,
      maxTitleLength: 80,
      maxTagLength: 12,
      maxStoreNameLength: 32,
      maxPriceTextLength: 20,
      maxContentLength: 4,
      maxCommentLength: 3,
      defaultCommentPageSize: 50,
      maxCommentPageSize: 100,
    };
    expect(normalizeContent('🙂'.repeat(4), policy)).toBe('🙂'.repeat(4));
    expect(normalizeCommentContent('🙂'.repeat(3), policy)).toBe('🙂'.repeat(3));
    expect(() => normalizeContent('🙂'.repeat(5), policy)).toThrow('4');
    expect(() => normalizeCommentContent('🙂'.repeat(4), policy)).toThrow('3');
  });

  it('公共用户帖子只返回目标作者内容，且作者 DTO 统一', async () => {
    const app = createApp();
    await setCommunityProfile(authorId, {
      nickname: '重复昵称也允许',
      avatarUrl: '/media/community-avatar/author.webp',
    });
    const authorPost = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '公开主页帖子',
    });
    await createDiscoverPost(app, {
      userId: otherAuthorId,
      studentId: '2023001002',
      title: '其他用户帖子',
    });

    const response = await app.request(`http://localhost/api/discover/users/${authorId}/posts`, {
      headers: await authHeaderFor(likerId, '2023001003'),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].id).toBe(authorPost.id);
    expect(body.data.items[0].author).toEqual({
      id: authorId,
      displayName: '重复昵称也允许',
      avatarUrl: '/media/community-avatar/author.webp',
    });
    expect(body.data.items[0].avatarUrl).toBeUndefined();
  });
});
