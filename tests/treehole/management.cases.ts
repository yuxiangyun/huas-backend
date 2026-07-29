/**
 * [INPUT]: 依赖 Treehole 测试支架、作者删除与后台帖子/评论管理 API
 * [OUTPUT]: 验证软删除后的不可见性、真实作者管理视图、后台删除及参数边界
 * [POS]: tests/treehole 的 Treehole 生命周期与管理面细分用例，失败时直接定位该业务能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  authorId,
  otherUserId,
  thirdUserId,
  createApp,
  authHeaderFor,
  adminSessionHeader,
  createTreeholePost,
  createTreeholeComment,
} from './harness';

describe('Treehole 生命周期与管理面', () => {
  it('作者删除帖子后，帖子与评论接口都不可再访问', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '今天想摆烂，但还是得继续写实验报告。');
    await createTreeholeComment(app, postId, otherUserId, '2023002002', '先把摘要写出来。');

    const forbiddenDelete = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      method: 'DELETE',
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(forbiddenDelete.status).toBe(404);

    const deleteRes = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      method: 'DELETE',
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(deleteRes.status).toBe(200);

    const detailRes = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(detailRes.status).toBe(404);

    const commentsRes = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(commentsRes.status).toBe(404);

    const listRes = await app.request('http://localhost/api/treehole/posts', {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    expect(listBody.data.items).toHaveLength(0);
  });

  it('管理员可查看树洞帖子与评论列表，并看到真实作者信息', async () => {
    const app = createApp();
    const firstPostId = await createTreeholePost(app, authorId, '2023002001', '图书馆三楼今天空调开得很足。');
    const secondPostId = await createTreeholePost(app, otherUserId, '2023002002', '今晚操场风很大，跑步很舒服。');
    await createTreeholeComment(app, secondPostId, authorId, '2023002001', '晚上人也不算太多。');
    const secondCommentId = await createTreeholeComment(app, secondPostId, thirdUserId, '2023002003', '风大但是很适合散步。');

    const listRes = await app.request('http://localhost/api/admin/treehole/posts?page=1&pageSize=10&keyword=操场', {
      headers: await adminSessionHeader(app),
    });
    expect(listRes.status).toBe(200);

    const listBody = await listRes.json() as any;
    expect(listBody.data.summary.totalPosts).toBe(2);
    expect(listBody.data.summary.totalComments).toBe(2);
    expect(listBody.data.total).toBe(1);
    expect(listBody.data.items).toHaveLength(1);
    expect(listBody.data.items[0].id).toBe(secondPostId);
    expect(listBody.data.items[0].author.studentId).toBe('2023002002');
    expect(listBody.data.items[0].author.className).toBe('软件工程2402班');
    expect(listBody.data.items[0].stats.commentCount).toBe(2);

    const commentsRes = await app.request(`http://localhost/api/admin/treehole/posts/${secondPostId}/comments?page=1&pageSize=10`, {
      headers: await adminSessionHeader(app),
    });
    expect(commentsRes.status).toBe(200);

    const commentsBody = await commentsRes.json() as any;
    expect(commentsBody.data.total).toBe(2);
    expect(commentsBody.data.items[0].id).toBe(secondCommentId);
    expect(commentsBody.data.items[0].author.studentId).toBe('2023002003');
    expect(commentsBody.data.items[1].author.studentId).toBe('2023002001');

    const firstPostCommentsRes = await app.request(`http://localhost/api/admin/treehole/posts/${firstPostId}/comments?page=1&pageSize=10`, {
      headers: await adminSessionHeader(app),
    });
    expect(firstPostCommentsRes.status).toBe(200);
    const firstPostCommentsBody = await firstPostCommentsRes.json() as any;
    expect(firstPostCommentsBody.data.items).toHaveLength(0);
  });

  it('管理员可删除帖子和评论，未登录与非法分页参数会被拒绝', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '树洞第一条消息。');
    const commentId = await createTreeholeComment(app, postId, otherUserId, '2023002002', '收到。');

    const unauthenticatedRes = await app.request('http://localhost/api/treehole/posts');
    expect(unauthenticatedRes.status).toBe(401);

    const invalidPageRes = await app.request('http://localhost/api/treehole/posts?page=0', {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(invalidPageRes.status).toBe(400);

    const invalidAdminPageRes = await app.request('http://localhost/api/admin/treehole/posts?page=0', {
      headers: await adminSessionHeader(app),
    });
    expect(invalidAdminPageRes.status).toBe(400);

    const invalidLogLimitRes = await app.request('http://localhost/api/admin/logs?limit=0', {
      headers: await adminSessionHeader(app),
    });
    expect(invalidLogLimitRes.status).toBe(400);

    const logsRes = await app.request('http://localhost/api/admin/logs?limit=5&keyword=Treehole', {
      headers: await adminSessionHeader(app),
    });
    expect(logsRes.status).toBe(200);
    const logsBody = await logsRes.json() as any;
    expect(logsBody.data.limit).toBe(5);
    expect(Array.isArray(logsBody.data.items)).toBe(true);

    const adminDeleteComment = await app.request(`http://localhost/api/admin/treehole/comments/${commentId}`, {
      method: 'DELETE',
      headers: await adminSessionHeader(app),
    });
    expect(adminDeleteComment.status).toBe(200);

    const detailAfterCommentDelete = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(detailAfterCommentDelete.status).toBe(200);
    const detailAfterCommentDeleteBody = await detailAfterCommentDelete.json() as any;
    expect(detailAfterCommentDeleteBody.data.stats.commentCount).toBe(0);

    const adminDeletePost = await app.request(`http://localhost/api/admin/treehole/posts/${postId}`, {
      method: 'DELETE',
      headers: await adminSessionHeader(app),
    });
    expect(adminDeletePost.status).toBe(200);
  });
});
