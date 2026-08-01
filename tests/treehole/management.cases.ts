/**
 * [INPUT]: 依赖 Treehole HTTP 支架、Operations 只读 query、管理命令用例与 Community 公共资料
 * [OUTPUT]: 验证作者删除、管理公共作者查询、LIKE 元字符搜索、软删除及认证/参数边界
 * [POS]: tests/treehole 的生命周期与管理细分用例，确保审核面不泄露校园敏感身份
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
  setCommunityProfile,
  treeholeOperationsQuery,
  treeholeService,
} from './harness';

describe('Treehole 生命周期与管理面', () => {
  it('作者删除帖子后，详情、评论与列表均不可见', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '继续写实验报告。');
    await createTreeholeComment(app, postId, otherUserId, '2023002002', '先把摘要写出来。');

    const forbidden = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      method: 'DELETE',
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(forbidden.status).toBe(404);
    const removed = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      method: 'DELETE',
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(removed.status).toBe(200);

    const detail = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    const comments = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(detail.status).toBe(404);
    expect(comments.status).toBe(404);
  });

  it('管理只读查询保留内容事实和公共作者，但不返回校园敏感信息', async () => {
    const app = createApp();
    await createTreeholePost(app, authorId, '2023002001', '图书馆三楼很安静。');
    const secondPostId = await createTreeholePost(app, otherUserId, '2023002002', '今晚操场风很大。');
    await createTreeholeComment(app, secondPostId, authorId, '2023002001', '晚上人不多。');
    await createTreeholeComment(app, secondPostId, thirdUserId, '2023002003', '很适合散步。');
    await setCommunityProfile(otherUserId, '跑步同学');

    const posts = await treeholeOperationsQuery.listPosts({ page: 1, pageSize: 10, keyword: '操场' });
    expect(posts.summary).toEqual({ totalPosts: 2, totalComments: 2, totalLikes: 0 });
    expect(posts.total).toBe(1);
    expect(posts.items[0]!.author).toEqual({
      id: otherUserId,
      displayName: '跑步同学',
      avatarUrl: null,
    });
    expect(JSON.stringify(posts.items[0]!.author)).not.toContain('2023002002');
    expect((posts.items[0]!.author as any).studentId).toBeUndefined();
    expect((posts.items[0]!.author as any).className).toBeUndefined();

    const comments = await treeholeOperationsQuery.listComments(secondPostId, { page: 1, pageSize: 10 });
    expect(comments?.total).toBe(2);
    expect(comments?.items.map((item) => item.author.id)).toEqual([thirdUserId, authorId]);
  });

  it('管理搜索把反斜杠、百分号和下划线视为字面字符', async () => {
    const app = createApp();
    await createTreeholePost(app, authorId, '2023002001', '数据库命中率 100%_ok。');
    await createTreeholePost(app, otherUserId, '2023002002', '数据库命中率 100xAok。');
    await createTreeholePost(app, authorId, '2023002001', 'Windows 路径 a\\b。');
    await createTreeholePost(app, otherUserId, '2023002002', 'Windows 路径 ab。');

    const result = await treeholeOperationsQuery.listPosts({
      page: 1,
      pageSize: 10,
      keyword: '100%_ok',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]!.content).toContain('100%_ok');

    const backslash = await treeholeOperationsQuery.listPosts({
      page: 1,
      pageSize: 10,
      keyword: 'a\\b',
    });
    expect(backslash.total).toBe(1);
    expect(backslash.items[0]!.content).toContain('a\\b');
  });

  it('管理命令仍可软删除评论和帖子并刷新计数', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '待管理内容。');
    const commentId = await createTreeholeComment(app, postId, otherUserId, '2023002002', '待管理评论。');

    expect(await treeholeService.adminDeleteComment(commentId)).toEqual({ id: commentId, postId });
    const detail = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect((await detail.json() as any).data.stats.commentCount).toBe(0);
    expect(await treeholeService.adminDeletePost(postId)).toEqual({ id: postId });
    expect(await treeholeService.adminDeletePost(postId)).toBeNull();
  });

  it('未认证请求与非法分页参数被 HTTP 边界拒绝', async () => {
    const app = createApp();
    expect((await app.request('http://localhost/api/treehole/posts')).status).toBe(401);
    const invalid = await app.request('http://localhost/api/treehole/posts?page=0', {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(invalid.status).toBe(400);
    const invalidUser = await app.request('http://localhost/api/treehole/users/not-a-number/posts', {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(invalidUser.status).toBe(400);
  });
});
