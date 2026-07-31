/**
 * [INPUT]: 依赖 Messaging canonical 纵向切片、CommunityProfileReader、Hono、Node 隔离媒体目录与显式迁移的测试 SQLite
 * [OUTPUT]: 覆盖一对一唯一/延迟建会话、UUID 幂等、事实限流、图文原子性/补偿、输入边界、鉴权、游标/未读与管理只读端口
 * [POS]: tests 的 Messaging 专项回归，锁定私信事实、私有媒体与 Community 投影的跨边界不变式
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import type { CommunityProfile } from '../src/modules/community/domain/community';
import type { CommunityProfileReader } from '../src/modules/community/domain/ports';
import { MessagingApplicationService } from '../src/modules/messaging/application/messaging-application-service';
import { createMessagingModule } from '../src/modules/messaging/composition';
import {
  DEFAULT_MESSAGING_POLICY,
  validateMessageImages,
  type MessagingPolicy,
} from '../src/modules/messaging/domain/messaging';
import type { MessagingRepository } from '../src/modules/messaging/domain/ports';
import { MessagingMediaStorage } from '../src/modules/messaging/infrastructure/messaging-media-storage';
import { SQLiteMessagingRepository } from '../src/modules/messaging/infrastructure/sqlite-messaging-repository';
import { clearSocialTestData } from './social-database';

const db = getDb();
const testRoot = (globalThis as any).__HUAS_TEST_ROOT__ as string;
const mediaRoot = join(testRoot, 'message-media-tests');
const fixedNow = new Date('2026-07-31T08:00:00.000Z');
const profiles = new Map<number, CommunityProfile>();
let profileBatches: number[][] = [];

const profileReader: CommunityProfileReader = {
  async getMany(userIds) {
    const uniqueIds = [...new Set(userIds)];
    profileBatches.push(uniqueIds);
    return new Map(uniqueIds.flatMap((userId) => {
      const profile = profiles.get(userId);
      return profile ? [[userId, profile] as const] : [];
    }));
  },
};

function createModule(
  reader: CommunityProfileReader = profileReader,
  policy: Partial<MessagingPolicy> = {},
) {
  return createMessagingModule({
    db,
    profileReader: reader,
    media: {
      storageRoot: mediaRoot,
      mediaBasePath: '/api/messaging/media',
      adminMediaBasePath: '/api/admin/messaging/media',
    },
    policy,
    now: () => new Date(fixedNow),
  });
}

async function createUser(label: string) {
  const rows = await db.insert(schema.users).values({
    studentId: `messaging-${label}-${randomUUID()}`,
    name: `真实姓名-${label}`,
    className: '软工24101班',
    createdAt: fixedNow,
    lastLoginAt: fixedNow,
    lastActiveAt: fixedNow,
  }).returning({ id: schema.users.id });
  const id = rows[0]!.id;
  profiles.set(id, {
    id,
    displayName: `公开用户-${label}`,
    avatarUrl: null,
  });
  return id;
}

function pngFile(name = 'photo.png') {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  return new File([bytes], name, { type: 'image/png' });
}

function sizedFile(size: number) {
  const file = pngFile();
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

async function sendText(
  senderUserId: number,
  recipientUserId: number,
  text: string,
  clientMessageId = randomUUID(),
) {
  return createModule().service.send({
    senderUserId,
    recipientUserId,
    clientMessageId,
    text,
  });
}

beforeEach(async () => {
  await clearSocialTestData(db);
  await rm(mediaRoot, { recursive: true, force: true });
  await mkdir(mediaRoot, { recursive: true });
  profiles.clear();
  profileBatches = [];
});

describe('Messaging conversation and idempotency invariants', () => {
  test('delays conversation creation until a valid first message and keeps one ordered pair', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const module = createModule();

    await expect(module.service.send({
      senderUserId: sender,
      recipientUserId: sender,
      clientMessageId: randomUUID(),
      text: 'self',
    })).rejects.toThrow('不能给自己');
    await expect(module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: 'not-a-uuid',
      text: 'invalid idempotency key',
    })).rejects.toThrow('UUID');
    await expect(module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      text: '   ',
    })).rejects.toThrow('至少需要');
    expect(await db.select().from(schema.conversations)).toHaveLength(0);

    const first = await module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      text: '第一条',
    });
    const second = await module.service.send({
      senderUserId: recipient,
      recipientUserId: sender,
      clientMessageId: randomUUID(),
      text: '回复',
    });
    const conversations = await db.select().from(schema.conversations);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.userLowId).toBe(Math.min(sender, recipient));
    expect(conversations[0]!.userHighId).toBe(Math.max(sender, recipient));
    expect(first.conversationId).toBe(second.conversationId);
    expect(await db.select().from(schema.messages)).toHaveLength(2);
  });

  test('returns the original message for sender UUID retries without consuming quota or creating another pair', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const other = await createUser('other');
    const module = createModule({
      async getMany(userIds) {
        return profileReader.getMany(userIds);
      },
    }, { sendLimit: 1 });
    const clientMessageId = randomUUID();
    const first = await module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId,
      text: '原始消息',
    });
    const retry = await module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId,
      text: '这次正文不应覆盖原事实',
      images: Array.from({ length: 10 }, () => pngFile()),
    });
    expect(retry).toEqual(first);
    expect(await db.select().from(schema.messages)).toHaveLength(1);

    const racePolicy = { ...DEFAULT_MESSAGING_POLICY, sendLimit: 1 };
    const raceRepository = new SQLiteMessagingRepository(db, racePolicy);
    raceRepository.findByClientMessageId = async () => null;
    const raceService = new MessagingApplicationService(
      raceRepository,
      module.media,
      profileReader,
      racePolicy,
      () => fixedNow,
    );
    const concurrentRetry = await raceService.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId,
      text: '并发重试',
      images: [pngFile()],
    });
    expect(concurrentRetry).toEqual(first);
    expect(await readdir(mediaRoot)).toEqual([]);

    await expect(module.service.send({
      senderUserId: sender,
      recipientUserId: other,
      clientMessageId,
      text: '错误复用',
    })).rejects.toThrow('另一个私信会话');
    expect(await db.select().from(schema.conversations)).toHaveLength(1);
  });
});

describe('Messaging limits and atomic media', () => {
  test('validates 1000 Unicode code points, 9 images, 32MB each and 64MB total boundaries', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const module = createModule();
    const exactlyThousandEmoji = '🙂'.repeat(1_000);
    const accepted = await module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      text: exactlyThousandEmoji,
    });
    expect(Array.from(accepted.text!)).toHaveLength(1_000);
    await expect(module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      text: `${exactlyThousandEmoji}🙂`,
    })).rejects.toThrow('1000');
    await expect(module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      images: Array.from({ length: 10 }, () => pngFile()),
    })).rejects.toThrow('9');

    expect(() => validateMessageImages(
      Array.from({ length: 9 }, () => pngFile()),
      DEFAULT_MESSAGING_POLICY,
    )).not.toThrow();

    expect(() => validateMessageImages(
      [sizedFile(32 * 1024 * 1024)],
      DEFAULT_MESSAGING_POLICY,
    )).not.toThrow();
    expect(() => validateMessageImages(
      [sizedFile(32 * 1024 * 1024 + 1)],
      DEFAULT_MESSAGING_POLICY,
    )).toThrow('32MB');
    expect(() => validateMessageImages(
      [sizedFile(32 * 1024 * 1024), sizedFile(32 * 1024 * 1024)],
      DEFAULT_MESSAGING_POLICY,
    )).not.toThrow();
    expect(() => validateMessageImages([
      sizedFile(32 * 1024 * 1024),
      sizedFile(32 * 1024 * 1024),
      sizedFile(1),
    ], DEFAULT_MESSAGING_POLICY)).toThrow('64MB');
  });

  test('rolls back conversation, message and every image metadata when one image insert fails', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const repository = new SQLiteMessagingRepository(db, DEFAULT_MESSAGING_POLICY);
    const duplicateStorageKey = `${randomUUID()}/01.webp`;

    await expect(repository.commitMessage({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      text: '图文原子性',
      createdAt: fixedNow,
      media: {
        batchKey: duplicateStorageKey.split('/')[0]!,
        images: [0, 1].map((sortOrder) => ({
          storageKey: duplicateStorageKey,
          sortOrder,
          width: 1,
          height: 1,
          sizeBytes: 10,
          mimeType: 'image/webp' as const,
        })),
      },
    })).rejects.toThrow();
    expect(await db.select().from(schema.conversations)).toHaveLength(0);
    expect(await db.select().from(schema.messages)).toHaveLength(0);
    expect(await db.select().from(schema.messageImages)).toHaveLength(0);
  });

  test('deletes prepared media on transaction failure but preserves committed media if response projection fails', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const media = new MessagingMediaStorage(db, DEFAULT_MESSAGING_POLICY, {
      storageRoot: mediaRoot,
      mediaBasePath: '/api/messaging/media',
      adminMediaBasePath: '/api/admin/messaging/media',
    });
    const failingRepository: MessagingRepository = {
      async findByClientMessageId() { return null; },
      async commitMessage() { throw new Error('forced transaction failure'); },
      async getConversationForUser() { return null; },
      async listConversations() { return { items: [], total: 0 }; },
      async listMessagesForUser() { return null; },
      async markRead() { return null; },
      async countUnread() { return 0; },
      async listAllConversations() { return { items: [], total: 0 }; },
      async listAllMessages() { return null; },
    };
    const failingService = new MessagingApplicationService(
      failingRepository,
      media,
      profileReader,
      DEFAULT_MESSAGING_POLICY,
      () => fixedNow,
    );
    await expect(failingService.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      images: [pngFile()],
    })).rejects.toThrow('forced transaction failure');
    expect(await readdir(mediaRoot)).toHaveLength(0);

    let projectionCalls = 0;
    const projectionFailureReader: CommunityProfileReader = {
      async getMany(userIds) {
        projectionCalls += 1;
        if (projectionCalls === 1) return profileReader.getMany(userIds);
        return new Map();
      },
    };
    const module = createModule(projectionFailureReader);
    await expect(module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      images: [pngFile()],
    })).rejects.toThrow('公开资料不可用');
    const storedImages = await db.select().from(schema.messageImages);
    expect(storedImages).toHaveLength(1);
    expect(await Bun.file(join(mediaRoot, storedImages[0]!.storageKey)).exists()).toBe(true);
    expect(await db.select().from(schema.messages)).toHaveLength(1);
  });

  test('enforces 30 successful messages per minute from persisted facts and lets an old idempotent retry pass', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const module = createModule();
    let firstKey = '';
    let firstId = 0;
    for (let index = 0; index < 30; index += 1) {
      const clientMessageId = randomUUID();
      const message = await module.service.send({
        senderUserId: sender,
        recipientUserId: recipient,
        clientMessageId,
        text: `message-${index}`,
      });
      if (index === 0) {
        firstKey = clientMessageId;
        firstId = message.id;
      }
    }
    await expect(module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      text: 'message-31',
    })).rejects.toMatchObject({ code: 4003, httpStatus: 429 });
    const retry = await module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: firstKey,
      text: 'ignored',
    });
    expect(retry.id).toBe(firstId);
    expect(await db.select().from(schema.messages)).toHaveLength(30);
  });
});

describe('Messaging read model, authorization and operations port', () => {
  test('computes unread from facts, advances only a monotonic participant cursor and isolates conversations', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const outsider = await createUser('outsider');
    const module = createModule();
    const first = await module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      text: '第一条',
    });
    const second = await module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      text: '第二条',
    });
    expect(await module.service.countUnread(recipient)).toBe(2);
    expect(await module.service.countUnread(sender)).toBe(0);
    expect((await module.service.listConversations(recipient)).items[0]!.unreadCount).toBe(2);
    expect(await module.service.listMessages(outsider, first.conversationId)).toBeNull();
    const incremental = await module.service.listMessages(recipient, first.conversationId, {
      afterMessageId: first.id,
    });
    expect(incremental!.items.map((message) => message.id)).toEqual([second.id]);

    const foreignConversationMessage = await module.service.send({
      senderUserId: outsider,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      text: '另一个会话',
    });
    expect(await module.service.markRead(
      recipient,
      first.conversationId,
      foreignConversationMessage.id,
    )).toBeNull();
    expect((await module.service.listConversations(recipient)).items
      .find((item) => item.id === first.conversationId)!.unreadCount).toBe(2);
    expect(await module.service.countUnread(recipient)).toBe(3);

    expect(await module.service.markRead(recipient, first.conversationId, first.id)).toMatchObject({
      lastReadMessageId: first.id,
      unreadCount: 1,
    });
    expect(await module.service.markRead(recipient, first.conversationId, first.id)).toMatchObject({
      lastReadMessageId: first.id,
      unreadCount: 1,
    });
    expect(await module.service.markRead(recipient, first.conversationId)).toMatchObject({
      lastReadMessageId: second.id,
      unreadCount: 0,
    });
    expect(await module.service.countUnread(recipient)).toBe(1);
    await module.service.markRead(recipient, foreignConversationMessage.conversationId);
    expect(await module.service.countUnread(recipient)).toBe(0);
  });

  test('batch-projects participants, uses one timezone, authorizes private media and exposes admin read-only URLs', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const outsider = await createUser('outsider');
    const module = createModule();
    const sent = await module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      text: '管理员可读正文',
      images: [pngFile('secret-name.png')],
    });
    const storageKey = (await db.select().from(schema.messageImages))[0]!.storageKey;
    expect(await module.service.getMedia(sender, storageKey)).not.toBeNull();
    expect(await module.service.getMedia(recipient, storageKey)).not.toBeNull();
    expect(await module.service.getMedia(outsider, storageKey)).toBeNull();

    profileBatches = [];
    const conversations = await module.service.listConversations(recipient);
    expect(conversations.items[0]!.otherUser.id).toBe(sender);
    expect(conversations.items[0]!.createdAt.endsWith('+08:00')).toBe(true);
    expect(conversations.items[0]!.updatedAt.endsWith('+08:00')).toBe(true);
    expect(conversations.items[0]!.lastMessage!.createdAt.endsWith('+08:00')).toBe(true);
    expect(profileBatches).toEqual([[sender]]);

    const adminConversations = await module.operationsQuery.listConversations();
    const adminMessages = await module.operationsQuery.listMessages(sent.conversationId);
    expect(adminConversations.items[0]!.participants.map((profile) => profile.id).sort())
      .toEqual([sender, recipient].sort());
    expect(adminConversations.items[0]!.createdAt.endsWith('+08:00')).toBe(true);
    expect(adminMessages!.items[0]!.text).toBe('管理员可读正文');
    expect(adminMessages!.items[0]!.images[0]!.url)
      .toBe(`/api/admin/messaging/media/${storageKey}`);
    expect(await module.operationsQuery.getMedia(storageKey)).not.toBeNull();
    expect('deleteConversation' in module.operationsQuery).toBe(false);
  });

  test('serves participant media through Messaging routes with a private no-store response', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const module = createModule();
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('userId', Number(c.req.header('x-test-user-id')));
      c.set('studentId', 'test-student');
      c.set('name', '测试用户');
      await next();
    });
    app.route('/api/messaging', module.routes);
    const form = new FormData();
    form.set('text', '路由图文');
    form.append('images', pngFile('must-not-enter-log.png'));
    const response = await app.request(`http://localhost/api/messaging/users/${recipient}/messages`, {
      method: 'POST',
      headers: {
        'x-test-user-id': String(sender),
        'Idempotency-Key': randomUUID(),
      },
      body: form,
    });
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    const mediaResponse = await app.request(`http://localhost${body.data.images[0].url}`, {
      headers: { 'x-test-user-id': String(recipient) },
    });
    expect(mediaResponse.status).toBe(200);
    expect(mediaResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(mediaResponse.headers.get('content-type')).toBe('image/webp');
  });

  test('cleans only old unreferenced UUID media directories and preserves referenced or grace-age batches', async () => {
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const module = createModule();
    await module.service.send({
      senderUserId: sender,
      recipientUserId: recipient,
      clientMessageId: randomUUID(),
      images: [pngFile()],
    });
    const referencedBatch = (await db.select().from(schema.messageImages))[0]!.storageKey.split('/')[0]!;
    const oldOrphan = randomUUID();
    const oldOrphanPath = join(mediaRoot, oldOrphan);
    await mkdir(oldOrphanPath);
    await writeFile(join(oldOrphanPath, '01.webp'), 'old-orphan');
    const graceOrphan = randomUUID();
    const graceOrphanPath = join(mediaRoot, graceOrphan);
    await mkdir(graceOrphanPath);
    await writeFile(join(graceOrphanPath, '01.webp'), 'grace-orphan');
    const old = new Date(fixedNow.getTime() - DEFAULT_MESSAGING_POLICY.orphanMediaGraceMs - 1);
    await utimes(oldOrphanPath, old, old);
    await utimes(join(mediaRoot, referencedBatch), old, old);
    await utimes(graceOrphanPath, fixedNow, fixedNow);
    expect(await module.orphanMediaCleanup.runOnce(fixedNow)).toBe(1);
    expect((await readdir(mediaRoot)).sort()).toEqual([graceOrphan, referencedBatch].sort());
  });
});
