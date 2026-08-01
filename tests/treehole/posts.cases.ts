/**
 * [INPUT]: 依赖 Treehole 测试支架、Community 资料事实、帖子/用户帖子 HTTP 与批量 reader 观测
 * [OUTPUT]: 验证 Unicode 内容边界、统一公共作者、资料实时投影、公共用户帖子接口与列表无 N+1
 * [POS]: tests/treehole 的帖子读模型细分用例，锁定彻底取消匿名后的公开协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  normalizeCommentContent,
  normalizePostContent,
} from '../../src/modules/treehole/domain/treehole';
import {
  authorId,
  otherUserId,
  thirdUserId,
  authHeaderFor,
  createApp,
  createTreeholePost,
  profileReader,
  setCommunityProfile,
  treeholePolicy,
} from './harness';

describe('Treehole 帖子与公共作者', () => {
  it('帖子与评论长度按 Unicode code point 计算', () => {
    expect(normalizePostContent('🙂'.repeat(treeholePolicy.maxPostLength), treeholePolicy))
      .toBe('🙂'.repeat(treeholePolicy.maxPostLength));
    expect(normalizeCommentContent('🙂'.repeat(treeholePolicy.maxCommentLength), treeholePolicy))
      .toBe('🙂'.repeat(treeholePolicy.maxCommentLength));
    expect(() => normalizePostContent(
      '🙂'.repeat(treeholePolicy.maxPostLength + 1),
      treeholePolicy,
    )).toThrow(String(treeholePolicy.maxPostLength));
    expect(() => normalizeCommentContent(
      '🙂'.repeat(treeholePolicy.maxCommentLength + 1),
      treeholePolicy,
    )).toThrow(String(treeholePolicy.maxCommentLength));
  });

  it('创建帖子后在详情和列表中返回统一 author 三字段', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '图书馆今天很安静。');

    const detailResponse = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json() as any).data;
    expect(detail.author).toEqual({
      id: authorId,
      displayName: `软件工程同学${authorId}`,
      avatarUrl: null,
    });
    expect(Object.keys(detail.author).sort()).toEqual(['avatarUrl', 'displayName', 'id']);
    expect(detail.viewer).toEqual({ liked: false, isMine: true });
    expect(detail.nickname).toBeUndefined();
    expect(detail.userId).toBeUndefined();

    const listResponse = await app.request('http://localhost/api/treehole/posts', {
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    const listed = (await listResponse.json() as any).data.items[0];
    expect(listed.author.id).toBe(authorId);
    expect(listed.viewer.isMine).toBe(false);
  });

  it('Community 昵称和头像通过 reader 实时投影到帖子，不保存资料快照', async () => {
    const app = createApp();
    const postId = await createTreeholePost(app, authorId, '2023002001', '资料投影测试。');
    await setCommunityProfile(authorId, '山风', '/media/treehole-avatar/current.webp');

    const firstResponse = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect((await firstResponse.json() as any).data.author).toEqual({
      id: authorId,
      displayName: '山风',
      avatarUrl: '/media/treehole-avatar/current.webp',
    });

    await setCommunityProfile(authorId, '晚风', null);
    const secondResponse = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect((await secondResponse.json() as any).data.author).toEqual({
      id: authorId,
      displayName: '晚风',
      avatarUrl: null,
    });
  });

  it('公共用户帖子接口只返回目标用户内容并保留 viewer 视角', async () => {
    const app = createApp();
    const firstId = await createTreeholePost(app, authorId, '2023002001', '第一条。');
    await createTreeholePost(app, otherUserId, '2023002002', '其他用户。');
    const secondId = await createTreeholePost(app, authorId, '2023002001', '第二条。');

    const response = await app.request(`http://localhost/api/treehole/users/${authorId}/posts?page=1&pageSize=10`, {
      headers: await authHeaderFor(thirdUserId, '2023002003'),
    });
    expect(response.status).toBe(200);
    const data = (await response.json() as any).data;
    expect(data.total).toBe(2);
    expect(data.items.map((item: any) => item.id)).toEqual([secondId, firstId]);
    expect(data.items.every((item: any) => item.author.id === authorId)).toBe(true);
    expect(data.items.every((item: any) => item.viewer.isMine === false)).toBe(true);
  });

  it('多作者列表只执行一次 Community 批量投影并去重用户 ID', async () => {
    const app = createApp();
    await createTreeholePost(app, authorId, '2023002001', '作者一。');
    await createTreeholePost(app, otherUserId, '2023002002', '作者二。');
    await createTreeholePost(app, authorId, '2023002001', '作者一再次发帖。');
    profileReader.reset();

    const response = await app.request('http://localhost/api/treehole/posts', {
      headers: await authHeaderFor(thirdUserId, '2023002003'),
    });
    expect(response.status).toBe(200);
    expect(profileReader.calls).toHaveLength(1);
    expect(profileReader.calls[0]).toEqual([authorId, otherUserId]);
  });
});
