/**
 * [INPUT]: 依赖 Discover 测试支架、帖子/点赞/列表/用户帖子 API、SQLite 事实与 Notifications 投影表
 * [OUTPUT]: 验证幂等点赞/通知撤销、自赞拒绝、popular 排序、点赞偏好推荐、latest 回退及统一作者 DTO
 * [POS]: tests/discover 的 Discover 点赞与推荐细分用例，锁定事实/Outbox/通知一致性与点赞推荐契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
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
  it('点赞/取消点赞幂等、计数一致，并拒绝点赞自己的帖子', async () => {
    const app = createApp();
    const post = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '幂等点赞测试',
    });

    const selfLike = await app.request(`http://localhost/api/discover/posts/${post.id}/like`, {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(selfLike.status).toBe(400);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.request(`http://localhost/api/discover/posts/${post.id}/like`, {
        method: 'POST',
        headers: await authHeaderFor(likerId, '2023001003'),
      });
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(body.data.likeCount).toBe(1);
      expect(body.data.likedByMe).toBe(true);
    }

    const likes = await getDb().select().from(schema.discoverPostLikes)
      .where(eq(schema.discoverPostLikes.postId, post.id));
    const posts = await getDb().select({ likeCount: schema.discoverPosts.likeCount })
      .from(schema.discoverPosts)
      .where(eq(schema.discoverPosts.id, post.id));
    expect(likes).toHaveLength(1);
    expect(posts[0].likeCount).toBe(1);
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
      expect(body.data.likeCount).toBe(0);
      expect(body.data.likedByMe).toBe(false);
    }

    expect(await getDb().select().from(schema.discoverPostLikes)
      .where(eq(schema.discoverPostLikes.postId, post.id))).toHaveLength(0);
    expect(await getDb().select().from(schema.notifications)
      .where(eq(schema.notifications.resourceId, post.id))).toHaveLength(0);
    expect(await getDb().select().from(schema.activityOutbox)).toHaveLength(0);

    const reLike = await app.request(`http://localhost/api/discover/posts/${post.id}/like`, {
      method: 'POST',
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
        method: 'POST',
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
      method: 'POST',
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
