/**
 * [INPUT]: 依赖 Community/Identity 构造注入 adapters、Hono 路由 factory、隔离 SQLite、sharp 与临时头像目录
 * [OUTPUT]: 覆盖默认 displayName、重复昵称、批量投影、公共字段隔离及新旧头像媒体生命周期
 * [POS]: tests 的 Community 纵向切片专项回归，锁定公共身份边界而不装配其他社交模块
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import sharp from 'sharp';
import { config } from '../src/config';
import { getDb, schema } from '../src/db';
import { CommunityApplicationService } from '../src/modules/community/application/community-application-service';
import { createCommunityRoutes } from '../src/modules/community/http/community.routes';
import { CommunityAvatarMediaStorage } from '../src/modules/community/infrastructure/community-avatar-media-storage';
import { SQLiteCommunityProfileRepository } from '../src/modules/community/infrastructure/sqlite-community-profile-repository';
import { SQLiteCommunityIdentityReader } from '../src/modules/identity/infrastructure/sqlite-community-identity-reader';
import { clearSocialTestData } from './social-database';

const db = getDb();
const profiles = new SQLiteCommunityProfileRepository(db);
const avatars = new CommunityAvatarMediaStorage(profiles, {
  storageRoot: config.community.avatarStorageRoot,
  mediaBasePath: config.community.avatarMediaBasePath,
  maxBytes: config.community.avatarMaxBytes,
  maxDimension: config.community.avatarMaxDimension,
  quality: config.community.avatarQuality,
});
const service = new CommunityApplicationService(
  new SQLiteCommunityIdentityReader(db),
  profiles,
  avatars,
);

let currentUserId = 0;
let otherUserId = 0;

async function createUser(studentId: string, className: string | null) {
  const now = new Date();
  const rows = await db.insert(schema.users).values({
    studentId,
    name: `真实姓名-${studentId}`,
    className,
    createdAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
  }).returning({ id: schema.users.id });
  return rows[0]!.id;
}

function createHttpApp() {
  const app = new Hono();
  app.use('*', async (c, next) => {
    const headerUserId = Number(c.req.header('x-test-user-id'));
    c.set('userId', Number.isInteger(headerUserId) && headerUserId > 0 ? headerUserId : currentUserId);
    await next();
  });
  app.route('/community', createCommunityRoutes(service));
  return app;
}

beforeEach(async () => {
  await clearSocialTestData(db);
  await rm(config.community.avatarStorageRoot, { recursive: true, force: true });
  currentUserId = await createUser('community-1001', '软工24101班');
  otherUserId = await createUser('community-1002', null);
});

describe('Community public profile', () => {
  test('builds stable default names and omits missing users from a deduplicated batch', async () => {
    const result = await service.getMany([currentUserId, currentUserId, otherUserId, -1, 999_999]);

    expect([...result.keys()]).toEqual([currentUserId, otherUserId]);
    expect(result.get(currentUserId)).toEqual({
      id: currentUserId,
      displayName: `软工同学${currentUserId}`,
      avatarUrl: null,
    });
    expect(result.get(otherUserId)?.displayName).toBe(`文理er ${otherUserId}`);
  });

  test('allows duplicate nicknames without exposing the stored nickname shape', async () => {
    const first = await service.updateProfile(currentUserId, { nickname: '  同名同学  ' });
    const second = await service.updateProfile(otherUserId, { nickname: '同名同学' });

    expect(first).toEqual({ id: currentUserId, displayName: '同名同学', avatarUrl: null });
    expect(second).toEqual({ id: otherUserId, displayName: '同名同学', avatarUrl: null });

    const rows = await db.select().from(schema.communityProfiles);
    expect(rows.map((row) => row.nickname)).toEqual(['同名同学', '同名同学']);
  });

  test('HTTP current/detail responses expose exactly id, displayName and avatarUrl', async () => {
    const app = createHttpApp();
    const form = new FormData();
    form.set('nickname', '公开昵称');
    const updatedResponse = await app.request('http://localhost/community/profile', {
      method: 'PUT',
      headers: { 'x-test-user-id': String(currentUserId) },
      body: form,
    });
    expect(updatedResponse.status).toBe(200);

    const cases = [
      {
        path: '/community/profile',
        expected: { id: otherUserId, displayName: `文理er ${otherUserId}`, avatarUrl: null },
      },
      {
        path: `/community/users/${currentUserId}`,
        expected: { id: currentUserId, displayName: '公开昵称', avatarUrl: null },
      },
    ];
    for (const { path, expected } of cases) {
      const response = await app.request(`http://localhost${path}`, {
        headers: { 'x-test-user-id': String(otherUserId) },
      });
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(Object.keys(body.data).sort()).toEqual(['avatarUrl', 'displayName', 'id']);
      expect(body.data).toEqual(expected);
      expect(JSON.stringify(body.data)).not.toContain('community-1001');
      expect(JSON.stringify(body.data)).not.toContain('真实姓名');
      expect(JSON.stringify(body.data)).not.toContain('软工24101班');
      expect(JSON.stringify(body.data)).not.toContain('nickname');
    }
  });
});

describe('Community avatar media', () => {
  test('preserves the profile write error when candidate cleanup also fails', async () => {
    const writeError = new Error('profile write failed');
    const isolatedService = new CommunityApplicationService(
      {
        getMany: async () => new Map([[currentUserId, { id: currentUserId, className: '软工24101班' }]]),
      },
      {
        getMany: async () => new Map(),
        save: async () => { throw writeError; },
        isAvatarPublished: async () => false,
      },
      {
        storeAvatar: async () => '/media/treehole-avatar/candidate.webp',
        removeAvatar: async () => { throw new Error('cleanup failed'); },
      },
    );

    await expect(isolatedService.updateProfile(currentUserId, {
      avatar: new File(['candidate'], 'candidate.png'),
    })).rejects.toBe(writeError);
  });

  test('stores an immutable WebP, publishes only the active profile URL, then removes it', async () => {
    const app = createHttpApp();
    const source = await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#1473e6' },
    }).jpeg().toBuffer();
    const form = new FormData();
    form.set('avatar', new File([source], 'portrait.jpg', { type: 'image/jpeg' }));

    const uploadResponse = await app.request('http://localhost/community/profile', {
      method: 'PUT',
      headers: { 'x-test-user-id': String(currentUserId) },
      body: form,
    });
    expect(uploadResponse.status).toBe(200);
    const uploaded = await uploadResponse.json() as any;
    expect(uploaded.data.avatarUrl).toMatch(/^\/media\/treehole-avatar\/\d+-[0-9a-f-]{36}\.webp$/);

    const file = await avatars.getPublicFile(uploaded.data.avatarUrl);
    expect(file).not.toBeNull();
    const metadata = await sharp(Buffer.from(await file!.arrayBuffer())).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(config.community.avatarMaxDimension);
    expect(metadata.height).toBe(config.community.avatarMaxDimension);

    const clearResponse = await app.request('http://localhost/community/profile/avatar', {
      method: 'DELETE',
      headers: { 'x-test-user-id': String(currentUserId) },
    });
    expect(clearResponse.status).toBe(200);
    expect((await clearResponse.json() as any).data.avatarUrl).toBeNull();
    expect(await avatars.getPublicFile(uploaded.data.avatarUrl)).toBeNull();
  });

  test('continues serving a migrated legacy {userId}.webp URL with a cache query', async () => {
    await mkdir(config.community.avatarStorageRoot, { recursive: true });
    const publicPath = `${config.community.avatarMediaBasePath}/${currentUserId}.webp`;
    await writeFile(
      join(config.community.avatarStorageRoot, `${currentUserId}.webp`),
      await sharp({ create: { width: 16, height: 16, channels: 3, background: '#fff' } }).webp().toBuffer(),
    );
    await profiles.save({
      userId: currentUserId,
      nickname: null,
      avatarUrl: `${publicPath}?v=legacy`,
    });

    expect(await avatars.getPublicFile(publicPath)).not.toBeNull();
  });
});
