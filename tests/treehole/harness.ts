/**
 * [INPUT]: 依赖 Bun Test hooks、注入式 Treehole/Notifications composition、Community reader、SQLite、Hono 认证、JWT 与 multipart FormData
 * [OUTPUT]: 提供含真实 Outbox 投影的 Treehole HTTP 测试应用、用户/资料/multipart 帖子/评论夹具及批量作者读取观测器
 * [POS]: tests/treehole 的共享支架，只装配 canonical 模块，不依赖根 routes 或 production singleton
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, expect } from 'bun:test';
import { rmSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import sharp from 'sharp';
import { generateToken } from '../../src/auth/jwt';
import { config } from '../../src/config';
import { getDb, schema } from '../../src/db';
import { authMiddleware } from '../../src/middleware/auth.middleware';
import { onAppError } from '../../src/middleware/error.middleware';
import { CommunityApplicationService } from '../../src/modules/community/application/community-application-service';
import type { CommunityProfile } from '../../src/modules/community/domain/community';
import type {
  CommunityAvatarStorage,
  CommunityProfileReader,
} from '../../src/modules/community/domain/ports';
import { SQLiteCommunityProfileRepository } from '../../src/modules/community/infrastructure/sqlite-community-profile-repository';
import { SQLiteCommunityIdentityReader } from '../../src/modules/identity/infrastructure/sqlite-community-identity-reader';
import { createTreeholeComposition } from '../../src/modules/treehole/composition';
import { createNotificationsModule } from '../../src/modules/notifications/composition';
import { createAdminRoutes } from '../../src/modules/operations/http/admin.routes';
import { clearSocialTestData } from '../social-database';

const db = getDb();
const profileRepository = new SQLiteCommunityProfileRepository(db);
const unusedAvatarStorage: CommunityAvatarStorage = {
  async storeAvatar() { throw new Error('Treehole 测试不写头像'); },
  async removeAvatar() {},
  async cleanupOrphans() { return 0; },
};
const communityService = new CommunityApplicationService(
  new SQLiteCommunityIdentityReader(db),
  profileRepository,
  unusedAvatarStorage,
);

class CountingProfileReader implements CommunityProfileReader {
  calls: number[][] = [];

  async getMany(userIds: readonly number[]): Promise<Map<number, CommunityProfile>> {
    this.calls.push([...userIds]);
    return communityService.getMany(userIds);
  }

  reset() {
    this.calls = [];
  }
}

export const profileReader = new CountingProfileReader();
export const treeholePolicy = {
  maxPostLength: config.treehole.maxPostLength,
  maxCommentLength: config.treehole.maxCommentLength,
  defaultPageSize: config.treehole.defaultPageSize,
  maxPageSize: config.treehole.maxPageSize,
  defaultCommentPageSize: config.treehole.defaultCommentPageSize,
  maxCommentPageSize: config.treehole.maxCommentPageSize,
  maxImagesPerPost: config.treehole.maxImagesPerPost,
  maxImageBytes: config.treehole.imageMaxBytes,
  maxImageTotalBytes: config.treehole.imageTotalMaxBytes,
  maxImagePixels: config.treehole.imageMaxPixels,
  maxOutputImageBytes: config.treehole.imageMaxOutputBytes,
  imageMaxDimension: config.treehole.imageMaxDimension,
  imageQuality: config.treehole.imageQuality,
  allowAnimatedImages: false,
  orphanMediaGraceMs: config.treehole.orphanMediaGraceMs,
};
const notifications = createNotificationsModule({ db, profileReader });
const treehole = createTreeholeComposition({
  db,
  profiles: profileReader,
  policy: treeholePolicy,
  activityOutbox: notifications.outboxWriter,
  activityProjection: {
    async attempt() {
      await notifications.projector.runOnce();
    },
  },
  media: {
    storageRoot: config.treehole.storageRoot,
    userMediaBasePath: config.treehole.userMediaBasePath,
    adminMediaBasePath: config.treehole.adminMediaBasePath,
  },
});

export const treeholeService = treehole.service;
export const treeholeOperationsQuery = treehole.operationsQuery;
export const treeholeMedia = treehole.media;
export let authorId = 0;
export let otherUserId = 0;
export let thirdUserId = 0;

export function createApp() {
  const app = new Hono();
  app.onError(onAppError);
  const api = new Hono();
  api.use('*', authMiddleware);
  api.route('/treehole', treehole.routes);
  app.route('/api', api);
  return app;
}

export function createAdminApp() {
  const app = new Hono();
  app.onError(onAppError);
  app.route('/api/admin', createAdminRoutes({
    dashboard: { async getDashboard() { throw new Error('Treehole 媒体测试不读取 Dashboard'); } },
    communityAdmin: {
      async deleteDiscoverPost() { return null; },
      listTreeholePosts: (options) => treeholeOperationsQuery.listPosts(options),
      listTreeholeComments: (postId, options) => treeholeOperationsQuery.listComments(postId, options),
      getTreeholeMedia: (mediaKey, fileName) => treeholeMedia.getForAdmin(mediaKey, fileName),
      deleteTreeholePost: (postId) => treeholeService.adminDeletePost(postId),
      deleteTreeholeComment: (commentId) => treeholeService.adminDeleteComment(commentId),
    },
    messagingAdmin: new Proxy({}, {
      get() {
        return async () => { throw new Error('Treehole 媒体测试不读取 Messaging'); };
      },
    }) as any,
    earlyRisingSettings: {
      async getAdminSettings() {
        return { profileEntryVisible: true, updatedAt: null, updatedBy: null };
      },
      async updateSettings(profileEntryVisible, updatedBy) {
        return { profileEntryVisible, updatedAt: new Date().toISOString(), updatedBy };
      },
    },
  }));
  return app;
}

export async function loginAdmin(app: Hono) {
  const response = await app.request('http://localhost/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'test-admin-password' }),
  });
  expect(response.status).toBe(200);
  return (response.headers.get('set-cookie') || '').split(';')[0]!;
}

export async function createUser(studentId: string, className: string | null) {
  const now = new Date();
  const inserted = await db.insert(schema.users).values({
    studentId,
    name: studentId,
    className,
    createdAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
  }).returning({ id: schema.users.id });
  return inserted[0]!.id;
}

export async function setCommunityProfile(
  userId: number,
  nickname: string | null,
  avatarUrl: string | null = null,
) {
  await profileRepository.patch(userId, { nickname, avatarUrl });
}

export async function authHeaderFor(userId: number, studentId: string) {
  const token = await generateToken({ userId, studentId });
  return { Authorization: `Bearer ${token}` };
}

export async function resetData() {
  await clearSocialTestData(db);
  rmSync(config.treehole.storageRoot, { recursive: true, force: true });
  profileReader.reset();
}

export async function createTreeholePost(app: Hono, userId: number, studentId: string, content: string) {
  const form = new FormData();
  form.set('content', content);
  const response = await app.request('http://localhost/api/treehole/posts', {
    method: 'POST',
    headers: await authHeaderFor(userId, studentId),
    body: form,
  });
  expect(response.status).toBe(201);
  return (await response.json() as any).data.id as number;
}

export async function createTreeholeComment(
  app: Hono,
  postId: number,
  userId: number,
  studentId: string,
  content: string,
  parentCommentId?: number,
) {
  const payload: Record<string, unknown> = { content };
  if (parentCommentId !== undefined) payload.parentCommentId = parentCommentId;
  const response = await app.request(`http://localhost/api/treehole/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(userId, studentId)),
    },
    body: JSON.stringify(payload),
  });
  expect(response.status).toBe(201);
  return (await response.json() as any).data.id as number;
}

beforeEach(async () => {
  await resetData();
  authorId = await createUser('2023002001', '软件工程2401班');
  otherUserId = await createUser('2023002002', '软件工程2402班');
  thirdUserId = await createUser('2023002003', '计算机科学2401班');
});

export { Hono, config, eq, getDb, schema, sharp };
