/**
 * [INPUT]: 依赖 Treehole 测试支架、UGC 合规 ASN/端口配置与后台热切换
 * [OUTPUT]: 验证来源命中空态以及合规模式下读隔离、写入放行与恢复
 * [POS]: tests/treehole 的 Treehole 合规读模型细分用例，失败时直接定位该业务能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  authorId,
  otherUserId,
  createApp,
  createAvatarFile,
  authHeaderFor,
  adminSessionHeader,
  createTreeholePost,
  createTreeholeComment,
  config,
} from './harness';

describe('Treehole 合规读模型', () => {
  it('命中配置 ASN 与端口时，Treehole GET 在 normal 模式下返回空态', async () => {
    const app = createApp();
    const authorHeaders = await authHeaderFor(authorId, '2023002001');
    const postId = await createTreeholePost(app, authorId, '2023002001', 'ASN 空读目标。');

    config.ugcCompliance.asns = [132203];
    config.ugcCompliance.ports = [443];
    config.ugcCompliance.asnHeader = 'x-client-asn';
    config.ugcCompliance.portHeader = 'x-forwarded-port';

    const normalList = await app.request('http://localhost/api/treehole/posts', {
      headers: authorHeaders,
    });
    expect(normalList.status).toBe(200);
    expect(((await normalList.json()) as any).data.total).toBe(1);

    const wrongPortList = await app.request('http://localhost/api/treehole/posts', {
      headers: {
        ...authorHeaders,
        'x-client-asn': 'AS132203',
        'x-forwarded-port': '80',
      },
    });
    expect(wrongPortList.status).toBe(200);
    expect(((await wrongPortList.json()) as any).data.total).toBe(1);

    const unauthenticatedList = await app.request('http://localhost/api/treehole/posts', {
      headers: {
        'x-client-asn': 'AS132203',
        'x-forwarded-port': '443',
      },
    });
    expect(unauthenticatedList.status).toBe(401);

    const matchedList = await app.request('http://localhost/api/treehole/posts?page=1&pageSize=6', {
      headers: {
        ...authorHeaders,
        'x-client-asn': 'AS132203',
        'x-forwarded-port': '443',
      },
    });
    expect(matchedList.status).toBe(200);
    expect(((await matchedList.json()) as any).data).toEqual({
      items: [],
      page: 1,
      pageSize: 6,
      total: 0,
      hasMore: false,
    });

    const matchedDetail = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: {
        ...authorHeaders,
        'x-client-asn': 'AS132203',
        'x-forwarded-port': '443',
      },
    });
    expect(matchedDetail.status).toBe(200);
    expect(((await matchedDetail.json()) as any).data).toBeNull();

    const metaRes = await app.request('http://localhost/api/treehole/meta', {
      headers: {
        ...authorHeaders,
        'x-client-asn': 'AS132203',
        'x-forwarded-port': '443',
      },
    });
    expect(metaRes.status).toBe(200);
    expect(((await metaRes.json()) as any).data.limits.maxPostLength).toBe(config.treehole.maxPostLength);
  });

  it('管理接口热开启 UGC 合规后，Treehole GET 返回纯文本 mock 或空态，写操作继续可用', async () => {
    const app = createApp();
    const authorHeaders = await authHeaderFor(authorId, '2023002001');

    const initialState = await app.request('http://localhost/api/admin/compliance/ugc', {
      headers: await adminSessionHeader(app),
    });
    expect(initialState.status).toBe(200);
    const initialStateBody = await initialState.json() as any;
    expect(initialStateBody.data.mode).toBe('normal');
    expect(initialStateBody.data.discoverMockText).toBe('');
    expect(initialStateBody.data.treeholeMockText).toBe('');

    const enableRes = await app.request('http://localhost/api/admin/compliance/ugc', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...await adminSessionHeader(app),
      },
      body: JSON.stringify({ mode: 'compliance' }),
    });
    expect(enableRes.status).toBe(200);
    const enableBody = await enableRes.json() as any;
    expect(enableBody.data.mode).toBe('compliance');
    expect(enableBody.data.treeholeMockText).toBe('');

    const unauthenticatedList = await app.request('http://localhost/api/treehole/posts');
    expect(unauthenticatedList.status).toBe(401);

    const metaRes = await app.request('http://localhost/api/treehole/meta', {
      headers: authorHeaders,
    });
    expect(metaRes.status).toBe(200);
    const metaBody = await metaRes.json() as any;
    expect(metaBody.data.limits.maxPostLength).toBe(config.treehole.maxPostLength);

    const uploadAvatarRes = await app.request('http://localhost/api/treehole/avatar', {
      method: 'POST',
      headers: await authHeaderFor(authorId, '2023002001'),
      body: (() => {
        const form = new FormData();
        form.set('avatar', createAvatarFile('compliance-avatar.png'));
        return form;
      })(),
    });
    expect(uploadAvatarRes.status).toBe(200);

    const postId = await createTreeholePost(app, authorId, '2023002001', '合规开关写入测试。');
    await createTreeholeComment(app, postId, otherUserId, '2023002002', '开关打开时评论写入仍可用。');

    const listRes = await app.request('http://localhost/api/treehole/posts?page=2&pageSize=6', {
      headers: authorHeaders,
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    expect(listBody.data).toEqual({
      items: [],
      page: 2,
      pageSize: 6,
      total: 0,
      hasMore: false,
    });

    const mockRes = await app.request('http://localhost/api/admin/compliance/ugc', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...await adminSessionHeader(app),
      },
      body: JSON.stringify({
        mode: 'compliance',
        discoverMockText: '分享美食不应该影响神秘角落',
        treeholeMockText: '树洞维护中\n晚点回来<>',
      }),
    });
    expect(mockRes.status).toBe(200);
    const mockBody = await mockRes.json() as any;
    expect(mockBody.data.discoverMockText).toBe('分享美食不应该影响神秘角落');
    expect(mockBody.data.treeholeMockText).toBe('树洞维护中\n晚点回来');

    const mockListRes = await app.request('http://localhost/api/treehole/posts?page=1&pageSize=6', {
      headers: authorHeaders,
    });
    expect(mockListRes.status).toBe(200);
    const mockListBody = await mockListRes.json() as any;
    expect(mockListBody.data.total).toBe(1);
    expect(mockListBody.data.items[0].id).toBe(0);
    expect(mockListBody.data.items[0].content).toBe('树洞维护中\n晚点回来');
    expect(mockListBody.data.items[0].avatarUrl).toBeNull();

    const commentsRes = await app.request(`http://localhost/api/treehole/posts/${postId}/comments?page=3&pageSize=8`, {
      headers: authorHeaders,
    });
    expect(commentsRes.status).toBe(200);
    const commentsBody = await commentsRes.json() as any;
    expect(commentsBody.data).toEqual({
      items: [],
      page: 3,
      pageSize: 8,
      total: 0,
      hasMore: false,
    });

    const avatarRes = await app.request('http://localhost/api/treehole/avatar', {
      headers: authorHeaders,
    });
    expect(avatarRes.status).toBe(200);
    const avatarBody = await avatarRes.json() as any;
    expect(avatarBody.data).toEqual({ avatarUrl: null });

    const unreadRes = await app.request('http://localhost/api/treehole/notifications/unread-count', {
      headers: authorHeaders,
    });
    expect(unreadRes.status).toBe(200);
    const unreadBody = await unreadRes.json() as any;
    expect(unreadBody.data).toEqual({ unreadCount: 0 });

    const detailRes = await app.request(`http://localhost/api/treehole/posts/${postId}`, {
      headers: authorHeaders,
    });
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json() as any;
    expect(detailBody.data).toBeNull();

    const disableRes = await app.request('http://localhost/api/admin/compliance/ugc', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...await adminSessionHeader(app),
      },
      body: JSON.stringify({ mode: 'normal' }),
    });
    expect(disableRes.status).toBe(200);
    expect((await disableRes.json() as any).data.mode).toBe('normal');

    const restoredListRes = await app.request('http://localhost/api/treehole/posts', {
      headers: authorHeaders,
    });
    expect(restoredListRes.status).toBe(200);
    const restoredListBody = await restoredListRes.json() as any;
    expect(restoredListBody.data.total).toBe(1);
    expect(restoredListBody.data.items[0].id).toBe(postId);
  });
});
