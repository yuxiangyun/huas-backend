/**
 * [INPUT]: 依赖 Bun Test hooks、Hono、Treehole 路由、SQLite、JWT、头像媒体与 UGC 运行态
 * [OUTPUT]: 提供 Treehole HTTP 测试应用、用户/帖子/评论/头像夹具及逐用例数据与配置重置
 * [POS]: tests/treehole 的共享测试支架，只承载可复用准备逻辑，不定义业务断言
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, beforeAll, beforeEach, expect } from 'bun:test';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { generateToken } from '../../src/auth/jwt';
import { config } from '../../src/config';
import { getDb, initDatabase, schema } from '../../src/db';
import { onAppError } from '../../src/middleware/error.middleware';
import { registerRoutes } from '../../src/routes';
import { ugcComplianceState } from '../../src/runtime/ugc-compliance-state';
import {
  TreeholeAvatarMediaService,
  TREEHOLE_AVATAR_CACHE_CONTROL,
} from '../../src/services/treehole/treehole-avatar-media-service';

export let authorId = 0;
export let otherUserId = 0;
export let thirdUserId = 0;

export function createApp() {
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

export const ONE_BY_ONE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zr9kAAAAASUVORK5CYII=';

export function createAvatarFile(name = 'avatar.png') {
  return new File(
    [Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64')],
    name,
    { type: 'image/png' }
  );
}

export async function createUser(studentId: string, className: string) {
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

export async function authHeaderFor(userId: number, studentId: string) {
  const token = await generateToken({ userId, studentId });
  return { Authorization: `Bearer ${token}` };
}

export async function adminSessionHeader(app: Hono) {
  const response = await app.request('http://localhost/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'test-admin-password' }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  return cookie ? { Cookie: cookie } : {};
}

export const originalUgcComplianceConfig = {
  asns: [...config.ugcCompliance.asns],
  ports: [...config.ugcCompliance.ports],
  asnHeader: config.ugcCompliance.asnHeader,
  portHeader: config.ugcCompliance.portHeader,
};

export function resetUgcComplianceConfig() {
  config.ugcCompliance.asns = [...originalUgcComplianceConfig.asns];
  config.ugcCompliance.ports = [...originalUgcComplianceConfig.ports];
  config.ugcCompliance.asnHeader = originalUgcComplianceConfig.asnHeader;
  config.ugcCompliance.portHeader = originalUgcComplianceConfig.portHeader;
}

export async function resetData() {
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

export async function createTreeholePost(app: Hono, userId: number, studentId: string, content: string) {
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

export async function createTreeholeComment(
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

export async function getTreeholeUnreadCount(app: Hono, userId: number, studentId: string) {
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


export {
  Hono,
  eq,
  config,
  getDb,
  schema,
  ugcComplianceState,
  TreeholeAvatarMediaService,
  TREEHOLE_AVATAR_CACHE_CONTROL,
};
