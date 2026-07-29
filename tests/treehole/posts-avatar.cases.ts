/**
 * [INPUT]: 依赖 Treehole 测试支架、帖子查询与头像媒体能力
 * [OUTPUT]: 验证化名帖子读模型、社区资料同步展示、头像上传删除与文件/昵称校验
 * [POS]: tests/treehole 的 Treehole 帖子与头像细分用例，失败时直接定位该业务能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  authorId,
  otherUserId,
  createApp,
  createAvatarFile,
  authHeaderFor,
  createTreeholePost,
  createTreeholeComment,
} from './harness';

describe('Treehole 帖子与头像', () => {
  it('创建帖子后可在最新列表和详情中查看，并保持前台匿名', async () => {
    const app = createApp();
    const postId = await createTreeholePost(
      app,
      authorId,
      '2023002001',
      '今天在图书馆坐了一下午，感觉脑子快转不动了。'
    );

    const detailRes = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json() as any;
    expect(detailBody.data.content).toContain('图书馆');
    expect(detailBody.data.stats.likeCount).toBe(0);
    expect(detailBody.data.stats.commentCount).toBe(0);
    expect(detailBody.data.viewer.isMine).toBe(true);
    expect(detailBody.data.viewer.liked).toBe(false);
    expect(detailBody.data.avatarUrl).toBeNull();
    expect(detailBody.data.nickname).toBeNull();
    expect(detailBody.data.author).toBeUndefined();
    expect(detailBody.data.userId).toBeUndefined();

    const listRes = await app.request('http://localhost/api/treehole/posts', {
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    expect(listBody.data.items).toHaveLength(1);
    expect(listBody.data.items[0].id).toBe(postId);
    expect(listBody.data.items[0].viewer.isMine).toBe(false);
    expect(listBody.data.items[0].avatarUrl).toBeNull();
    expect(listBody.data.items[0].nickname).toBeNull();
  });

  it('头像支持上传删除，并在帖子和评论返回中同步', async () => {
    const app = createApp();

    const uploadForm = new FormData();
    uploadForm.set('avatar', createAvatarFile('mine.png'));
    const uploadRes = await app.request('http://localhost/api/treehole/avatar', {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023002001'),
      body: uploadForm,
    });
    expect(uploadRes.status).toBe(200);
    const uploadBody = await uploadRes.json() as any;
    expect(typeof uploadBody.data.avatarUrl).toBe('string');
    expect(uploadBody.data.avatarUrl).toContain('/media/treehole-avatar/');
    const avatarUrl = uploadBody.data.avatarUrl as string;
    const avatarPath = avatarUrl.split('?')[0];

    const profileForm = new FormData();
    profileForm.set('nickname', '山风_7');
    const profileUpdateRes = await app.request('http://localhost/api/treehole/profile', {
      method: 'PUT',
      headers: await authHeaderFor(authorId, '2023002001'),
      body: profileForm,
    });
    expect(profileUpdateRes.status).toBe(200);
    const profileUpdateBody = await profileUpdateRes.json() as any;
    expect(profileUpdateBody.data).toEqual({ avatarUrl, nickname: '山风_7' });

    const avatarInfoRes = await app.request('http://localhost/api/treehole/profile', {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(avatarInfoRes.status).toBe(200);
    const avatarInfoBody = await avatarInfoRes.json() as any;
    expect(avatarInfoBody.data.avatarUrl).toBe(avatarUrl);
    expect(avatarInfoBody.data.nickname).toBe('山风_7');

    const avatarFileRes = await app.request(`http://localhost${avatarPath}`);
    expect(avatarFileRes.status).toBe(200);

    const postId = await createTreeholePost(app, authorId, '2023002001', '头像上线测试');
    await createTreeholeComment(app, postId, authorId, '2023002001', '这是我的评论');

    const listRes = await app.request('http://localhost/api/treehole/posts', {
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    expect(listBody.data.items[0].avatarUrl).toBe(avatarUrl);
    expect(listBody.data.items[0].nickname).toBe('山风_7');

    const commentsRes = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(commentsRes.status).toBe(200);
    const commentsBody = await commentsRes.json() as any;
    expect(commentsBody.data.items[0].avatarUrl).toBe(avatarUrl);
    expect(commentsBody.data.items[0].nickname).toBe('山风_7');

    const deleteAvatarRes = await app.request('http://localhost/api/treehole/avatar', {
      method: 'DELETE',
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(deleteAvatarRes.status).toBe(200);
    const deleteAvatarBody = await deleteAvatarRes.json() as any;
    expect(deleteAvatarBody.data.avatarUrl).toBeNull();
    expect(deleteAvatarBody.data.nickname).toBe('山风_7');

    const avatarMissingRes = await app.request(`http://localhost${avatarPath}`);
    expect(avatarMissingRes.status).toBe(404);

    const avatarInfoAfterDeleteRes = await app.request('http://localhost/api/treehole/profile', {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(avatarInfoAfterDeleteRes.status).toBe(200);
    const avatarInfoAfterDeleteBody = await avatarInfoAfterDeleteRes.json() as any;
    expect(avatarInfoAfterDeleteBody.data.avatarUrl).toBeNull();
    expect(avatarInfoAfterDeleteBody.data.nickname).toBe('山风_7');

    const listAfterDeleteRes = await app.request('http://localhost/api/treehole/posts', {
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(listAfterDeleteRes.status).toBe(200);
    const listAfterDeleteBody = await listAfterDeleteRes.json() as any;
    expect(listAfterDeleteBody.data.items[0].avatarUrl).toBeNull();
    expect(listAfterDeleteBody.data.items[0].nickname).toBe('山风_7');
  });

  it('头像上传会拒绝缺失文件和非图片文件', async () => {
    const app = createApp();

    const emptyForm = new FormData();
    const missingRes = await app.request('http://localhost/api/treehole/avatar', {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023002001'),
      body: emptyForm,
    });
    expect(missingRes.status).toBe(400);

    const invalidForm = new FormData();
    invalidForm.set('avatar', new File(['not-image'], 'plain.txt', { type: 'text/plain' }));
    const invalidRes = await app.request('http://localhost/api/treehole/avatar', {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023002001'),
      body: invalidForm,
    });
    expect(invalidRes.status).toBe(400);
  });

  it('昵称允许清空并拒绝短值、特殊字符和保留名称', async () => {
    const app = createApp();

    for (const nickname of ['a', '坏-名字', '管理员']) {
      const invalidForm = new FormData();
      invalidForm.set('nickname', nickname);
      const invalidRes = await app.request('http://localhost/api/treehole/profile', {
        method: 'PUT',
        headers: await authHeaderFor(authorId, '2023002001'),
        body: invalidForm,
      });
      expect(invalidRes.status).toBe(400);
    }

    const clearForm = new FormData();
    clearForm.set('nickname', '  ');
    const clearRes = await app.request('http://localhost/api/treehole/profile', {
      method: 'PUT',
      headers: await authHeaderFor(authorId, '2023002001'),
      body: clearForm,
    });
    expect(clearRes.status).toBe(200);
    const clearBody = await clearRes.json() as any;
    expect(clearBody.data.nickname).toBeNull();
  });
});
