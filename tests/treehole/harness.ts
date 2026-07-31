/**
 * [INPUT]: 依赖 Bun Test hooks、注入式 Treehole/Notifications composition、Community reader、SQLite、Hono 认证与 JWT
 * [OUTPUT]: 提供含真实 Outbox 投影的 Treehole HTTP 测试应用、用户/资料/帖子/评论夹具及批量作者读取观测器
 * [POS]: tests/treehole 的共享支架，只装配 canonical 模块，不依赖根 routes 或 production singleton
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, expect } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
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
import { clearSocialTestData } from '../social-database';

const db = getDb();
const profileRepository = new SQLiteCommunityProfileRepository(db);
const unusedAvatarStorage: CommunityAvatarStorage = {
  async storeAvatar() { throw new Error('Treehole 测试不写头像'); },
  async removeAvatar() {},
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
});

export const treeholeService = treehole.service;
export const treeholeOperationsQuery = treehole.operationsQuery;
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
  await profileRepository.save({ userId, nickname, avatarUrl });
}

export async function authHeaderFor(userId: number, studentId: string) {
  const token = await generateToken({ userId, studentId });
  return { Authorization: `Bearer ${token}` };
}

export async function resetData() {
  await clearSocialTestData(db);
  profileReader.reset();
}

export async function createTreeholePost(app: Hono, userId: number, studentId: string, content: string) {
  const response = await app.request('http://localhost/api/treehole/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaderFor(userId, studentId)),
    },
    body: JSON.stringify({ content }),
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

export { Hono, eq, getDb, schema };
