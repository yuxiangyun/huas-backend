/**
 * [INPUT]: 依赖 Hono 测试应用、Treehole canonical 路由链、SQLite 测试库、兼容头像媒体出口与 JWT 测试令牌
 * [OUTPUT]: 验证 Treehole 帖子、评论、点赞、头像、通知、管理接口与 UGC 合规热开关/ASN 空态
 * [POS]: tests 的 Treehole 业务回归套件，保护 modules/treehole 与旧 Facade 的 HTTP/事务/媒体契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { generateToken } from '../src/auth/jwt';
import { config } from '../src/config';
import { getDb, initDatabase, schema } from '../src/db';
import { onAppError } from '../src/middleware/error.middleware';
import { registerRoutes } from '../src/routes';
import { ugcComplianceState } from '../src/runtime/ugc-compliance-state';
import {
  TreeholeAvatarMediaService,
  TREEHOLE_AVATAR_CACHE_CONTROL,
} from '../src/services/treehole/treehole-avatar-media-service';

let authorId = 0;
let otherUserId = 0;
let thirdUserId = 0;

function createApp() {
  const app = new Hono();
  app.onError(onAppError);
  app.get(`${config.treehole.avatarMediaBasePath}/*`, async (c) => {
    const file = await TreeholeAvatarMediaService.getPublicFile(c.req.path);
    if (!file) return c.notFound();

    return new Response(file, {
      headers: {
        'Cache-Control': TREEHOLE_AVATAR_CACHE_CONTROL,
        'Content-Type': file.type || 'application/octet-stream',
      },
    });
  });
  registerRoutes(app);
  return app;
}

const ONE_BY_ONE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zr9kAAAAASUVORK5CYII=';

function createAvatarFile(name = 'avatar.png') {
  return new File(
    [Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64')],
    name,
    { type: 'image/png' }
  );
}

async function createUser(studentId: string, className: string) {
  const db = getDb();
  const now = new Date();
  const inserted = await db.insert(schema.users).values({
    studentId,
    name: studentId,
    className,
    createdAt: now,
    lastLoginAt: now,
  }).returning({ id: schema.users.id });

  return inserted[0].id as number;
}

async function authHeaderFor(userId: number, studentId: string) {
  const token = await generateToken({ userId, studentId });
  return { Authorization: `Bearer ${token}` };
}

async function adminSessionHeader(app: Hono) {
  const response = await app.request('http://localhost/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'test-admin-password' }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  return cookie ? { Cookie: cookie } : {};
}

const originalUgcComplianceConfig = {
  asns: [...config.ugcCompliance.asns],
  ports: [...config.ugcCompliance.ports],
  asnHeader: config.ugcCompliance.asnHeader,
  portHeader: config.ugcCompliance.portHeader,
};

function resetUgcComplianceConfig() {
  config.ugcCompliance.asns = [...originalUgcComplianceConfig.asns];
  config.ugcCompliance.ports = [...originalUgcComplianceConfig.ports];
  config.ugcCompliance.asnHeader = originalUgcComplianceConfig.asnHeader;
  config.ugcCompliance.portHeader = originalUgcComplianceConfig.portHeader;
}

async function resetData() {
  const db = getDb();
  await db.delete(schema.treeholeCommentNotifications);
  await db.delete(schema.treeholePostLikes);
  await db.delete(schema.treeholeComments);
  await db.delete(schema.treeholePosts);
  await db.delete(schema.discoverComments);
  await db.delete(schema.discoverPostRatings);
  await db.delete(schema.discoverPosts);
  await db.delete(schema.credentials);
  await db.delete(schema.cache);
  await db.delete(schema.users);
}

async function createTreeholePost(app: Hono, userId: number, studentId: string, content: string) {
  const res = await app.request('http://localhost/api/treehole/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(userId, studentId)),
    },
    body: JSON.stringify({ content }),
  });

  expect(res.status).toBe(201);
  return (await res.json() as any).data.id as number;
}

async function createTreeholeComment(
  app: Hono,
  postId: number,
  userId: number,
  studentId: string,
  content: string,
  parentCommentId?: number
) {
  const payload: Record<string, unknown> = { content };
  if (parentCommentId !== undefined) {
    payload.parentCommentId = parentCommentId;
  }

  const res = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(userId, studentId)),
    },
    body: JSON.stringify(payload),
  });

  expect(res.status).toBe(201);
  return (await res.json() as any).data.id as number;
}

async function getTreeholeUnreadCount(app: Hono, userId: number, studentId: string) {
  const res = await app.request('http://localhost/api/treehole/notifications/unread-count', {
    headers: await authHeaderFor(userId, studentId),
  });
  expect(res.status).toBe(200);
  return (await res.json() as any).data.unreadCount as number;
}

beforeAll(() => {
  initDatabase();
});

beforeEach(async () => {
  ugcComplianceState.configure({
    mode: 'normal',
    discoverMockText: '',
    treeholeMockText: '',
  }, 'test');
  await resetData();
  authorId = await createUser('2023002001', '软件工程2401班');
  otherUserId = await createUser('2023002002', '软件工程2402班');
  thirdUserId = await createUser('2023002003', '计算机科学2401班');
});

afterEach(() => {
  ugcComplianceState.configure({
    mode: 'normal',
    discoverMockText: '',
    treeholeMockText: '',
  }, 'test');
  resetUgcComplianceConfig();
});

describe('treehole module', () => {
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

    const avatarInfoRes = await app.request('http://localhost/api/treehole/avatar', {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(avatarInfoRes.status).toBe(200);
    const avatarInfoBody = await avatarInfoRes.json() as any;
    expect(avatarInfoBody.data.avatarUrl).toBe(avatarUrl);

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

    const commentsRes = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(commentsRes.status).toBe(200);
    const commentsBody = await commentsRes.json() as any;
    expect(commentsBody.data.items[0].avatarUrl).toBe(avatarUrl);

    const deleteAvatarRes = await app.request('http://localhost/api/treehole/avatar', {
      method: 'DELETE',
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(deleteAvatarRes.status).toBe(200);
    const deleteAvatarBody = await deleteAvatarRes.json() as any;
    expect(deleteAvatarBody.data.avatarUrl).toBeNull();

    const avatarMissingRes = await app.request(`http://localhost${avatarPath}`);
    expect(avatarMissingRes.status).toBe(404);

    const avatarInfoAfterDeleteRes = await app.request('http://localhost/api/treehole/avatar', {
      headers: await authHeaderFor(authorId, '2023002001'),
    });
    expect(avatarInfoAfterDeleteRes.status).toBe(200);
    const avatarInfoAfterDeleteBody = await avatarInfoAfterDeleteRes.json() as any;
    expect(avatarInfoAfterDeleteBody.data.avatarUrl).toBeNull();

    const listAfterDeleteRes = await app.request('http://localhost/api/treehole/posts', {
      headers: await authHeaderFor(otherUserId, '2023002002'),
    });
    expect(listAfterDeleteRes.status).toBe(200);
    const listAfterDeleteBody = await listAfterDeleteRes.json() as any;
    expect(listAfterDeleteBody.data.items[0].avatarUrl).toBeNull();
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
