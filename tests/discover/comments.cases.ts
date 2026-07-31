/**
 * [INPUT]: 依赖 Discover 测试支架、评论/回复/删除 API、帖子夹具与 Notifications 投影事实
 * [OUTPUT]: 验证社区资料投影、评论通知 recipient 去重、分页、父评论约束、作者删除与帖子删除后的级联可见性
 * [POS]: tests/discover 的 Discover 评论生命周期细分用例，失败时直接定位该业务能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  authorId,
  otherAuthorId,
  likerId,
  createApp,
  authHeaderFor,
  createDiscoverPost,
  createDiscoverComment,
  setCommunityProfile,
  eq,
  getDb,
  schema,
} from './harness';

describe('Discover 评论生命周期', () => {
  it('评论支持分页与回复，批量投影统一作者资料，并同步帖子评论数', async () => {
    const app = createApp();
    const post = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '评论功能测试',
      color: '#ff7844',
    });

    await setCommunityProfile(authorId, {
      avatarUrl: '/media/community-avatar/test-poster.webp',
      nickname: '饭搭子',
    });
    await setCommunityProfile(otherAuthorId, {
      avatarUrl: '/media/community-avatar/test-commenter.webp',
      nickname: '评论员_2',
    });

    const firstComment = await createDiscoverComment(app, {
      postId: post.id,
      userId: otherAuthorId,
      studentId: '2023001002',
      content: '第一条评论',
    });
    const secondComment = await createDiscoverComment(app, {
      postId: post.id,
      userId: likerId,
      studentId: '2023001003',
      content: '回复第一条',
      parentCommentId: firstComment.id,
    });

    expect(secondComment.parentCommentId).toBe(firstComment.id);
    const activityRows = await getDb().select().from(schema.notifications)
      .where(eq(schema.notifications.resourceId, post.id));
    expect(activityRows).toHaveLength(3);
    expect(activityRows.filter((row) => row.type === 'discover_comment')).toEqual([
      expect.objectContaining({
        recipientUserId: authorId,
        actorUserId: otherAuthorId,
        subresourceId: firstComment.id,
      }),
    ]);
    expect(activityRows.filter((row) => row.type === 'discover_comment_reply')
      .map((row) => row.recipientUserId).sort((a, b) => a - b))
      .toEqual([authorId, otherAuthorId].sort((a, b) => a - b));
    expect(activityRows.filter((row) => row.type === 'discover_comment_reply')
      .every((row) => row.actorUserId === likerId && row.subresourceId === secondComment.id))
      .toBe(true);

    const firstPageRes = await app.request(`http://localhost/api/discover/posts/${post.id}/comments?page=1&pageSize=1`, {
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(firstPageRes.status).toBe(200);
    const firstPageBody = await firstPageRes.json() as any;
    expect(firstPageBody.data.total).toBe(2);
    expect(firstPageBody.data.items[0].id).toBe(firstComment.id);
    expect(firstPageBody.data.items[0].author).toEqual({
      id: otherAuthorId,
      displayName: '评论员_2',
      avatarUrl: '/media/community-avatar/test-commenter.webp',
    });
    expect(firstPageBody.data.items[0].avatarUrl).toBeUndefined();

    const secondPageRes = await app.request(`http://localhost/api/discover/posts/${post.id}/comments?page=2&pageSize=1`, {
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(secondPageRes.status).toBe(200);
    const secondPageBody = await secondPageRes.json() as any;
    expect(secondPageBody.data.items[0].id).toBe(secondComment.id);
    expect(secondPageBody.data.items[0].parentCommentId).toBe(firstComment.id);

    const detailRes = await app.request(`http://localhost/api/discover/posts/${post.id}`, {
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json() as any;
    expect(detailBody.data.commentCount).toBe(2);

    const listRes = await app.request('http://localhost/api/discover/posts?sort=latest', {
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    expect(listBody.data.items[0].commentCount).toBe(2);
    expect(listBody.data.items[0].author).toEqual({
      id: authorId,
      displayName: '饭搭子',
      avatarUrl: '/media/community-avatar/test-poster.webp',
    });
  });

  it('评论会校验父评论合法性（跨帖/已删除/非法 ID）', async () => {
    const app = createApp();
    const postA = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '帖子A',
      color: '#44aaff',
    });
    const postB = await createDiscoverPost(app, {
      userId: otherAuthorId,
      studentId: '2023001002',
      title: '帖子B',
      color: '#55cc88',
    });

    const postBComment = await createDiscoverComment(app, {
      postId: postB.id,
      userId: otherAuthorId,
      studentId: '2023001002',
      content: 'B 帖评论',
    });

    const crossPostReplyRes = await app.request(`http://localhost/api/discover/posts/${postA.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(likerId, '2023001003')),
      },
      body: JSON.stringify({
        content: '跨帖回复',
        parentCommentId: postBComment.id,
      }),
    });
    expect(crossPostReplyRes.status).toBe(400);

    const postAComment = await createDiscoverComment(app, {
      postId: postA.id,
      userId: otherAuthorId,
      studentId: '2023001002',
      content: 'A 帖评论',
    });

    const deleteParentRes = await app.request(`http://localhost/api/discover/comments/${postAComment.id}`, {
      method: 'DELETE',
      headers: await authHeaderFor(otherAuthorId, '2023001002'),
    });
    expect(deleteParentRes.status).toBe(200);

    const deletedParentReplyRes = await app.request(`http://localhost/api/discover/posts/${postA.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(authorId, '2023001001')),
      },
      body: JSON.stringify({
        content: '回复已删除评论',
        parentCommentId: postAComment.id,
      }),
    });
    expect(deletedParentReplyRes.status).toBe(400);

    const invalidParentRes = await app.request(`http://localhost/api/discover/posts/${postA.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(authorId, '2023001001')),
      },
      body: JSON.stringify({
        content: '非法父评论',
        parentCommentId: -1,
      }),
    });
    expect(invalidParentRes.status).toBe(400);
  });

  it('仅评论作者可删除评论，删除后评论数会在详情和列表同步', async () => {
    const app = createApp();
    const post = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '删除评论权限测试',
      color: '#ff9966',
    });

    const comment = await createDiscoverComment(app, {
      postId: post.id,
      userId: otherAuthorId,
      studentId: '2023001002',
      content: '我要被删除',
    });

    const forbiddenDelete = await app.request(`http://localhost/api/discover/comments/${comment.id}`, {
      method: 'DELETE',
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(forbiddenDelete.status).toBe(404);

    const deleteRes = await app.request(`http://localhost/api/discover/comments/${comment.id}`, {
      method: 'DELETE',
      headers: await authHeaderFor(otherAuthorId, '2023001002'),
    });
    expect(deleteRes.status).toBe(200);

    const detailRes = await app.request(`http://localhost/api/discover/posts/${post.id}`, {
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json() as any;
    expect(detailBody.data.commentCount).toBe(0);

    const listRes = await app.request('http://localhost/api/discover/posts?sort=latest', {
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    expect(listBody.data.items[0].commentCount).toBe(0);
  });

  it('帖子删除后，评论列表/创建评论/删除评论接口都返回 404', async () => {
    const app = createApp();
    const post = await createDiscoverPost(app, {
      userId: authorId,
      studentId: '2023001001',
      title: '删除帖子后评论测试',
      color: '#9988ff',
    });

    const comment = await createDiscoverComment(app, {
      postId: post.id,
      userId: otherAuthorId,
      studentId: '2023001002',
      content: '先留一条评论',
    });

    const deletePostRes = await app.request(`http://localhost/api/discover/posts/${post.id}`, {
      method: 'DELETE',
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(deletePostRes.status).toBe(200);

    const listCommentsRes = await app.request(`http://localhost/api/discover/posts/${post.id}/comments`, {
      headers: await authHeaderFor(authorId, '2023001001'),
    });
    expect(listCommentsRes.status).toBe(404);

    const createCommentRes = await app.request(`http://localhost/api/discover/posts/${post.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(otherAuthorId, '2023001002')),
      },
      body: JSON.stringify({ content: '删帖后再评论' }),
    });
    expect(createCommentRes.status).toBe(404);

    const deleteCommentRes = await app.request(`http://localhost/api/discover/comments/${comment.id}`, {
      method: 'DELETE',
      headers: await authHeaderFor(otherAuthorId, '2023001002'),
    });
    expect(deleteCommentRes.status).toBe(404);
  });
});
