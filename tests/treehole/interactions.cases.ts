/**
 * [INPUT]: 依赖 Treehole 测试支架、点赞、评论回复、删除、Notifications 投影与 Community 批量 reader 观测
 * [OUTPUT]: 验证幂等点赞/通知撤销、自赞门禁、评论 recipient 规则、公共作者、分页计数、回复约束与无 N+1
 * [POS]: tests/treehole 的社交交互细分用例，锁定事实/Outbox/通知一致性与 Community 作者边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  authorId,
  otherUserId,
  thirdUserId,
  authHeaderFor,
  createApp,
  createTreeholeComment,
  createTreeholePost,
  eq,
  getDb,
  profileReader,
  schema,
  setCommunityProfile,
} from './harness';

describe('Treehole 社交交互', () => {
  it('点赞与取消点赞幂等，且明确拒绝作者点赞自己的帖子', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '希望这周不要再下雨。');

    const selfLike = await app.request(`http://localhost/api/treehole/posts/${postId}/like`, {
      method: 'PUT',
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(selfLike.status).toBe(400);

    const headers = await authHeaderFor(otherUserId, '2023002002');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.request(`http://localhost/api/treehole/posts/${postId}/like`, {
        method: 'PUT',
        headers,
      });
      expect(response.status).toBe(200);
      expect((await response.json() as any).data.stats.likeCount).toBe(1);
    }
    const likeRows = await getDb().select().from(schema.treeholePostLikes)
      .where(eq(schema.treeholePostLikes.postId, postId));
    expect(likeRows).toHaveLength(1);
    const projectedLikes = await getDb().select().from(schema.notifications)
      .where(eq(schema.notifications.resourceId, postId));
    expect(projectedLikes).toHaveLength(1);
    expect(projectedLikes[0]).toMatchObject({
      recipientUserId: authorId,
      actorUserId: otherUserId,
      type: 'treehole_like',
      resourceType: 'treehole_post',
      subresourceId: null,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.request(`http://localhost/api/treehole/posts/${postId}/like`, {
        method: 'DELETE',
        headers,
      });
      expect(response.status).toBe(200);
      expect((await response.json() as any).data.stats.likeCount).toBe(0);
    }
    expect(await getDb().select().from(schema.notifications)
      .where(eq(schema.notifications.resourceId, postId))).toHaveLength(0);

    const reLike = await app.request(`http://localhost/api/treehole/posts/${postId}/like`, {
      method: 'PUT',
      headers,
    });
    expect(reLike.status).toBe(200);
    expect(await getDb().select().from(schema.notifications)
      .where(eq(schema.notifications.resourceId, postId))).toHaveLength(1);
  });

  it('评论分页返回统一作者，删除后同步刷新帖子计数', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '考试周真的太折磨人。');
    await setCommunityProfile(otherUserId, '解题人');
    const firstId = await createTreeholeComment(app, postId, otherUserId, '2023002002', '先把最难的过掉。');
    const secondId = await createTreeholeComment(app, postId, authorId, '2023002001', '已经开始背重点。');

    const firstPage = await app.request(
      `http://localhost/api/treehole/posts/${postId}/comments?page=1&pageSize=1`,
      { headers: await authHeaderFor(thirdUserId, '2023002003') },
    );
    const firstData = (await firstPage.json() as any).data;
    expect(firstData.total).toBe(2);
    expect(firstData.items[0].id).toBe(firstId);
    expect(firstData.items[0].author).toEqual({
      id: otherUserId,
      displayName: '解题人',
      avatarUrl: null,
    });

    const forbidden = await app.request(`http://localhost/api/treehole/comments/${secondId}`, {
      method: 'DELETE',
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(forbidden.status).toBe(404);
    const removed = await app.request(`http://localhost/api/treehole/comments/${secondId}`, {
      method: 'DELETE',
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(removed.status).toBe(200);

    const detail = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect((await detail.json() as any).data.stats.commentCount).toBe(1);
  });

  it('评论列表对多个作者只执行一次 Community 批量读取', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '批量评论。');
    await createTreeholeComment(app, postId, otherUserId, '2023002002', '评论一。');
    await createTreeholeComment(app, postId, thirdUserId, '2023002003', '评论二。');
    await createTreeholeComment(app, postId, otherUserId, '2023002002', '评论三。');
    profileReader.reset();

    const response = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(response.status).toBe(200);
    expect(profileReader.calls).toHaveLength(1);
    expect(profileReader.calls[0]).toEqual([otherUserId, thirdUserId]);
  });

  it('回复必须引用同帖且未删除的父评论', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '今天有点迷茫。');
    const parentId = await createTreeholeComment(app, postId, otherUserId, '2023002002', '慢慢来。');
    const replyId = await createTreeholeComment(
      app,
      postId,
      thirdUserId,
      '2023002003',
      '谢谢你。',
      parentId,
    );
    expect(replyId).toBeGreaterThan(0);
    const activityRows = await getDb().select().from(schema.notifications)
      .where(eq(schema.notifications.resourceId, postId));
    expect(activityRows.filter((row) => row.type === 'treehole_comment')).toEqual([
      expect.objectContaining({
        recipientUserId: authorId,
        actorUserId: otherUserId,
        subresourceId: parentId,
      }),
    ]);
    expect(activityRows.filter((row) => row.type === 'treehole_comment_reply')
      .map((row) => row.recipientUserId).sort((a, b) => a - b))
      .toEqual([authorId, otherUserId].sort((a, b) => a - b));

    const anotherPostId = await createTreeholePost(app, thirdUserId, '2023002003', '另一条。');
    const anotherCommentId = await createTreeholeComment(
      app,
      anotherPostId,
      authorId,
      '2023002001',
      '另一条评论。',
    );
    const crossReply = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(thirdUserId, '2023002003')),
      },
      body: JSON.stringify({ content: '跨帖回复', parentCommentId: anotherCommentId }),
    });
    expect(crossReply.status).toBe(400);

    await app.request(`http://localhost/api/treehole/comments/${parentId}`, {
      method: 'DELETE',
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    const deletedReply = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(authorId, '2023002001')),
      },
      body: JSON.stringify({ content: '回复已删除评论', parentCommentId: parentId }),
    });
    expect(deletedReply.status).toBe(400);
  });
});
