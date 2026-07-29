/**
 * [INPUT]: 依赖 Treehole 测试支架、点赞、个人列表、评论回复与通知 API
 * [OUTPUT]: 验证幂等点赞、个人内容、评论计数、回复约束与通知已读流程
 * [POS]: tests/treehole 的 Treehole 社交交互细分用例，失败时直接定位该业务能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  authorId,
  otherUserId,
  thirdUserId,
  createApp,
  authHeaderFor,
  createTreeholePost,
  createTreeholeComment,
  getTreeholeUnreadCount,
  eq,
  getDb,
  schema,
} from './harness';

describe('Treehole 社交交互', () => {
  it('点赞与取消点赞保持幂等，不会产生重复记录', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '希望这周不要再下雨了。');

    const likeHeaders = await authHeaderFor(otherUserId, '2023002002');
    const firstLike = await app.request(`http://localhost/api/treehole/posts/${postId}/like`, {
      method: 'PUT',
      headers: likeHeaders,
    });
    expect(firstLike.status).toBe(200);
    const firstLikeBody = await firstLike.json() as any;
    expect(firstLikeBody.data.stats.likeCount).toBe(1);
    expect(firstLikeBody.data.viewer.liked).toBe(true);

    const secondLike = await app.request(`http://localhost/api/treehole/posts/${postId}/like`, {
      method: 'PUT',
      headers: likeHeaders,
    });
    expect(secondLike.status).toBe(200);
    const secondLikeBody = await secondLike.json() as any;
    expect(secondLikeBody.data.stats.likeCount).toBe(1);

    const db = getDb();
    const likeRows = await db.select().from(schema.treeholePostLikes).where(eq(schema.treeholePostLikes.postId, postId));
    expect(likeRows).toHaveLength(1);

    const firstUnlike = await app.request(`http://localhost/api/treehole/posts/${postId}/like`, {
      method: 'DELETE',
      headers: likeHeaders,
    });
    expect(firstUnlike.status).toBe(200);
    const firstUnlikeBody = await firstUnlike.json() as any;
    expect(firstUnlikeBody.data.stats.likeCount).toBe(0);
    expect(firstUnlikeBody.data.viewer.liked).toBe(false);

    const secondUnlike = await app.request(`http://localhost/api/treehole/posts/${postId}/like`, {
      method: 'DELETE',
      headers: likeHeaders,
    });
    expect(secondUnlike.status).toBe(200);
    const secondUnlikeBody = await secondUnlike.json() as any;
    expect(secondUnlikeBody.data.stats.likeCount).toBe(0);
  });

  it('我的树洞列表只返回当前用户自己的未删除内容', async () => {
    const app = createApp();
    const firstMinePostId = await createTreeholePost(app, authorId, '2023002001', '这是我第一条树洞。');
    const otherPostId = await createTreeholePost(app, otherUserId, '2023002002', '这是别人的树洞。');
    const secondMinePostId = await createTreeholePost(app, authorId, '2023002001', '这是我第二条树洞。');

    const myListRes = await app.request('http://localhost/api/treehole/posts/me?page=1&pageSize=10', {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(myListRes.status).toBe(200);
    const myListBody = await myListRes.json() as any;
    expect(myListBody.data.total).toBe(2);
    expect(myListBody.data.items).toHaveLength(2);
    expect(myListBody.data.items[0].id).toBe(secondMinePostId);
    expect(myListBody.data.items[1].id).toBe(firstMinePostId);
    expect(myListBody.data.items.every((item: any) => item.viewer.isMine === true)).toBe(true);
    expect(myListBody.data.items.some((item: any) => item.id === otherPostId)).toBe(false);
  });

  it('评论支持分页读取，删除后会同步更新帖子计数', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '考试周真的太折磨人了。');
    const firstCommentId = await createTreeholeComment(app, postId, otherUserId, '2023002002', '先把最难的那门过掉。');
    const secondCommentId = await createTreeholeComment(app, postId, authorId, '2023002001', '已经开始背重点了。');

    const firstPageRes = await app.request(`http://localhost/api/treehole/posts/${postId}/comments?page=1&pageSize=1`, {
      headers: await authHeaderFor(thirdUserId, '2023002003'),
    });
    expect(firstPageRes.status).toBe(200);
    const firstPageBody = await firstPageRes.json() as any;
    expect(firstPageBody.data.total).toBe(2);
    expect(firstPageBody.data.items[0].id).toBe(firstCommentId);

    const secondPageRes = await app.request(`http://localhost/api/treehole/posts/${postId}/comments?page=2&pageSize=1`, {
      headers: await authHeaderFor(thirdUserId, '2023002003'),
    });
    expect(secondPageRes.status).toBe(200);
    const secondPageBody = await secondPageRes.json() as any;
    expect(secondPageBody.data.items[0].id).toBe(secondCommentId);

    const forbiddenDelete = await app.request(`http://localhost/api/treehole/comments/${secondCommentId}`, {
      method: 'DELETE',
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(forbiddenDelete.status).toBe(404);

    const deleteRes = await app.request(`http://localhost/api/treehole/comments/${secondCommentId}`, {
      method: 'DELETE',
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(deleteRes.status).toBe(200);

    const detailRes = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json() as any;
    expect(detailBody.data.stats.commentCount).toBe(1);
  });

  it('评论支持回复同帖评论，并拒绝非法父评论', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '今天有点迷茫。');
    const firstCommentId = await createTreeholeComment(app, postId, otherUserId, '2023002002', '慢慢来。');

    const replyRes = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(thirdUserId, '2023002003')),
      },
      body: JSON.stringify({
        content: '谢谢你。',
        parentCommentId: firstCommentId,
      }),
    });
    expect(replyRes.status).toBe(201);
    const replyBody = await replyRes.json() as any;
    expect(replyBody.data.parentCommentId).toBe(firstCommentId);

    const anotherPostId = await createTreeholePost(app, thirdUserId, '2023002003', '另一条树洞。');
    const anotherCommentId = await createTreeholeComment(app, anotherPostId, authorId, '2023002001', '另一条评论。');

    const crossPostReplyRes = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(thirdUserId, '2023002003')),
      },
      body: JSON.stringify({
        content: '跨帖回复',
        parentCommentId: anotherCommentId,
      }),
    });
    expect(crossPostReplyRes.status).toBe(400);

    const deleteParentRes = await app.request(`http://localhost/api/treehole/comments/${firstCommentId}`, {
      method: 'DELETE',
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(deleteParentRes.status).toBe(200);

    const deletedParentReplyRes = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaderFor(authorId, '2023002001')),
      },
      body: JSON.stringify({
        content: '回复已删除评论',
        parentCommentId: firstCommentId,
      }),
    });
    expect(deletedParentReplyRes.status).toBe(400);
  });

  it('评论与回复会产生提醒并支持全部已读', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '今天状态一般。');
    const firstCommentId = await createTreeholeComment(app, postId, otherUserId, '2023002002', '早点休息。');
    await createTreeholeComment(app, postId, thirdUserId, '2023002003', '也要记得吃饭。', firstCommentId);
    await createTreeholeComment(app, postId, authorId, '2023002001', '收到。', firstCommentId);

    expect(await getTreeholeUnreadCount(app, authorId, '2023002001')).toBe(2);
    expect(await getTreeholeUnreadCount(app, otherUserId, '2023002002')).toBe(2);
    expect(await getTreeholeUnreadCount(app, thirdUserId, '2023002003')).toBe(0);

    const otherReadAllRes = await app.request('http://localhost/api/treehole/notifications/read-all', {
      method: 'POST',
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(otherReadAllRes.status).toBe(200);
    const otherReadAllBody = await otherReadAllRes.json() as any;
    expect(otherReadAllBody.data.readCount).toBe(2);
    expect(await getTreeholeUnreadCount(app, otherUserId, '2023002002')).toBe(0);

    const otherReadAllAgainRes = await app.request('http://localhost/api/treehole/notifications/read-all', {
      method: 'POST',
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(otherReadAllAgainRes.status).toBe(200);
    const otherReadAllAgainBody = await otherReadAllAgainRes.json() as any;
    expect(otherReadAllAgainBody.data.readCount).toBe(0);

    const ownerCommentId = await createTreeholeComment(app, postId, authorId, '2023002001', '我先补充一点。');
    await createTreeholeComment(app, postId, otherUserId, '2023002002', '回复楼主评论', ownerCommentId);
    expect(await getTreeholeUnreadCount(app, authorId, '2023002001')).toBe(3);

    const ownerReadAllRes = await app.request('http://localhost/api/treehole/notifications/read-all', {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(ownerReadAllRes.status).toBe(200);
    const ownerReadAllBody = await ownerReadAllRes.json() as any;
    expect(ownerReadAllBody.data.readCount).toBe(3);
    expect(await getTreeholeUnreadCount(app, authorId, '2023002001')).toBe(0);
  });
});
