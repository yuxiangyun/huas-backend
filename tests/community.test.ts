/**
 * [INPUT]: 依赖 Community/Identity 构造注入 adapters、Hono 路由 factory、隔离 SQLite、sharp 与临时头像目录
 * [OUTPUT]: 覆盖默认 displayName、昵称校验、公共 DTO、并发字段 patch、头像引用保护、宽限期孤儿回收与媒体生命周期
 * [POS]: tests 的 Community 纵向切片专项回归，锁定本人编辑并发安全与公共身份最小披露边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, utimes, writeFile } from 'node:fs/promises';
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
  app.route('/community', createCommunityRoutes(service, {
    avatarMaxBytes: config.community.avatarMaxBytes,
  }));
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

    const noDigitClassUserId = await createUser('community-no-digit', '软工班');
    expect((await service.getProfile(noDigitClassUserId))?.displayName)
      .toBe(`文理er ${noDigitClassUserId}`);
  });

  test('allows duplicate nicknames and returns stored nickname only in current-profile writes', async () => {
    const first = await service.updateProfile(currentUserId, { nickname: '  同名同学  ' });
    const second = await service.updateProfile(otherUserId, { nickname: '同名同学' });

    expect(first).toEqual({
      id: currentUserId,
      displayName: '同名同学',
      avatarUrl: null,
      nickname: '同名同学',
    });
    expect(second).toEqual({
      id: otherUserId,
      displayName: '同名同学',
      avatarUrl: null,
      nickname: '同名同学',
    });

    const rows = await db.select().from(schema.communityProfiles);
    expect(rows.map((row) => row.nickname)).toEqual(['同名同学', '同名同学']);
  });

  test('enforces Unicode nickname bounds, reserved names and control-character rejection', async () => {
    await expect(service.updateProfile(currentUserId, { nickname: '一' }))
      .rejects.toMatchObject({ code: 4002 });
    await expect(service.updateProfile(currentUserId, { nickname: '🙂'.repeat(13) }))
      .rejects.toMatchObject({ code: 4002 });
    for (const reserved of ['管理员', '官方', '系统', '匿名用户']) {
      await expect(service.updateProfile(currentUserId, { nickname: ` ${reserved} ` }))
        .rejects.toMatchObject({ code: 4002 });
    }
    await expect(service.updateProfile(currentUserId, { nickname: '换\n行' }))
      .rejects.toMatchObject({ code: 4002 });
    await expect(service.updateProfile(currentUserId, { nickname: `控制\u0000符` }))
      .rejects.toMatchObject({ code: 4002 });

    const unicode = await service.updateProfile(currentUserId, { nickname: '🙂同' });
    expect(unicode.nickname).toBe('🙂同');
    const cleared = await service.updateProfile(currentUserId, { nickname: '   ' });
    expect(cleared).toEqual({
      id: currentUserId,
      displayName: `软工同学${currentUserId}`,
      avatarUrl: null,
      nickname: null,
    });
    expect((await db.select().from(schema.communityProfiles))[0]!.nickname).toBeNull();
  });

  test('HTTP current profile adds nickname while public detail remains exactly three fields', async () => {
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
        expected: {
          id: otherUserId,
          displayName: `文理er ${otherUserId}`,
          avatarUrl: null,
          nickname: null,
        },
        keys: ['avatarUrl', 'displayName', 'id', 'nickname'],
      },
      {
        path: `/community/users/${currentUserId}`,
        expected: { id: currentUserId, displayName: '公开昵称', avatarUrl: null },
        keys: ['avatarUrl', 'displayName', 'id'],
      },
    ];
    for (const { path, expected, keys } of cases) {
      const response = await app.request(`http://localhost${path}`, {
        headers: { 'x-test-user-id': String(otherUserId) },
      });
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(Object.keys(body.data).sort()).toEqual(keys);
      expect(body.data).toEqual(expected);
      expect(JSON.stringify(body.data)).not.toContain('community-1001');
      expect(JSON.stringify(body.data)).not.toContain('真实姓名');
      expect(JSON.stringify(body.data)).not.toContain('软工24101班');
      if (path.includes('/users/')) expect('nickname' in body.data).toBe(false);
    }
  });
});

describe('Community avatar media', () => {
  test('preserves concurrent nickname and avatar field updates', async () => {
    const oldAvatarUrl = '/media/treehole-avatar/old.webp';
    const candidateAvatarUrl = '/media/treehole-avatar/candidate.webp';
    await profiles.patch(currentUserId, {
      nickname: '原昵称',
      avatarUrl: oldAvatarUrl,
    });

    let releaseStore!: () => void;
    let reportStoreStarted!: () => void;
    const storeGate = new Promise<void>((resolve) => { releaseStore = resolve; });
    const storeStarted = new Promise<void>((resolve) => { reportStoreStarted = resolve; });
    const removed: string[] = [];
    const concurrentService = new CommunityApplicationService(
      new SQLiteCommunityIdentityReader(db),
      profiles,
      {
        async storeAvatar() {
          reportStoreStarted();
          await storeGate;
          return candidateAvatarUrl;
        },
        async removeAvatar(avatarUrl) { removed.push(avatarUrl); },
        async cleanupOrphans() { return 0; },
      },
    );

    const avatarUpdate = concurrentService.updateProfile(currentUserId, {
      avatar: new File(['candidate'], 'candidate.png'),
    });
    await storeStarted;
    await concurrentService.updateProfile(currentUserId, { nickname: '并发新昵称' });
    releaseStore();
    await avatarUpdate;

    expect((await profiles.getMany([currentUserId])).get(currentUserId)).toEqual({
      userId: currentUserId,
      nickname: '并发新昵称',
      avatarUrl: candidateAvatarUrl,
    });
    expect(removed).toEqual([oldAvatarUrl]);
  });

  test('does not delete a replaced avatar URL while another profile still references it', async () => {
    const sharedAvatarUrl = '/media/treehole-avatar/shared.webp';
    const candidateAvatarUrl = '/media/treehole-avatar/candidate.webp';
    await profiles.patch(currentUserId, { avatarUrl: sharedAvatarUrl });
    await profiles.patch(otherUserId, { avatarUrl: `${sharedAvatarUrl}?v=legacy` });
    const removed: string[] = [];
    const guardedService = new CommunityApplicationService(
      new SQLiteCommunityIdentityReader(db),
      profiles,
      {
        async storeAvatar() { return candidateAvatarUrl; },
        async removeAvatar(avatarUrl) { removed.push(avatarUrl); },
        async cleanupOrphans() { return 0; },
      },
    );

    await guardedService.updateProfile(currentUserId, {
      avatar: new File(['candidate'], 'candidate.png'),
    });

    expect(removed).toEqual([]);
    expect(await profiles.isAvatarPublished(sharedAvatarUrl)).toBe(true);
  });

  test('preserves the profile write error when candidate cleanup also fails', async () => {
    const writeError = new Error('profile write failed');
    const isolatedService = new CommunityApplicationService(
      {
        getMany: async () => new Map([[currentUserId, { id: currentUserId, className: '软工24101班' }]]),
      },
      {
        getMany: async () => new Map(),
        patch: async () => { throw writeError; },
        isAvatarPublished: async () => false,
        listPublishedAvatarUrls: async () => [],
      },
      {
        storeAvatar: async () => '/media/treehole-avatar/candidate.webp',
        removeAvatar: async () => { throw new Error('cleanup failed'); },
        cleanupOrphans: async () => 0,
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
    await profiles.patch(currentUserId, {
      nickname: null,
      avatarUrl: `${publicPath}?v=legacy`,
    });

    expect(await avatars.getPublicFile(publicPath)).not.toBeNull();
  });

  test('removes only unreferenced avatar files older than the grace cutoff', async () => {
    await mkdir(config.community.avatarStorageRoot, { recursive: true });
    const activeName = `${currentUserId}-11111111-1111-4111-8111-111111111111.webp`;
    const oldOrphanName = `${otherUserId}-22222222-2222-4222-8222-222222222222.webp`;
    const freshOrphanName = `${otherUserId}-33333333-3333-4333-8333-333333333333.webp`;
    const activePath = join(config.community.avatarStorageRoot, activeName);
    const oldOrphanPath = join(config.community.avatarStorageRoot, oldOrphanName);
    const freshOrphanPath = join(config.community.avatarStorageRoot, freshOrphanName);
    await Promise.all([
      writeFile(activePath, 'active'),
      writeFile(oldOrphanPath, 'old-orphan'),
      writeFile(freshOrphanPath, 'fresh-orphan'),
    ]);
    const now = Date.now();
    const old = new Date(now - 2 * 60 * 60 * 1000);
    await Promise.all([
      utimes(activePath, old, old),
      utimes(oldOrphanPath, old, old),
    ]);
    await profiles.patch(currentUserId, {
      avatarUrl: `${config.community.avatarMediaBasePath}/${activeName}?v=active`,
    });

    await expect(service.cleanupOrphanAvatars(new Date(now - 60 * 60 * 1000))).resolves.toBe(1);
    expect(await Bun.file(activePath).exists()).toBe(true);
    expect(await Bun.file(oldOrphanPath).exists()).toBe(false);
    expect(await Bun.file(freshOrphanPath).exists()).toBe(true);
  });
});
