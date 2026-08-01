/**
 * [INPUT]: 依赖 Messaging application/SQLite repository、可控时钟/媒体端口与隔离测试数据库
 * [OUTPUT]: 验证慢图片与快文本并发提交时消息时间按完成顺序生成，且陈旧调用方时间不能回退会话
 * [POS]: tests 的 Messaging 时间单调专项回归，隔离耗时媒体处理与 SQLite 提交顺序的不变量
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { getDb, schema } from '../src/db';
import type { CommunityProfile } from '../src/modules/community/domain/community';
import type { CommunityProfileReader } from '../src/modules/community/domain/ports';
import { MessagingApplicationService } from '../src/modules/messaging/application/messaging-application-service';
import { DEFAULT_MESSAGING_POLICY } from '../src/modules/messaging/domain/messaging';
import type { MessageMediaStorage } from '../src/modules/messaging/domain/ports';
import { SQLiteMessagingRepository } from '../src/modules/messaging/infrastructure/sqlite-messaging-repository';
import { clearSocialTestData } from './social-database';

const db = getDb();
const profiles = new Map<number, CommunityProfile>();

const profileReader: CommunityProfileReader = {
  async getMany(userIds) {
    return new Map(userIds.flatMap((userId) => {
      const profile = profiles.get(userId);
      return profile ? [[userId, profile] as const] : [];
    }));
  },
};

async function createUser(label: string) {
  const now = new Date('2026-07-31T08:00:00.000Z');
  const inserted = await db.insert(schema.users).values({
    studentId: `messaging-time-${label}-${randomUUID()}`,
    name: `时间测试-${label}`,
    className: '软工24101班',
    createdAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
  }).returning({ id: schema.users.id });
  const id = inserted[0]!.id;
  profiles.set(id, { id, displayName: `时间测试-${label}`, avatarUrl: null });
  return id;
}

beforeEach(async () => {
  await clearSocialTestData(db);
  profiles.clear();
});

test('timestamps after media preparation and never moves a conversation backward', async () => {
  const sender = await createUser('sender');
  const recipient = await createUser('recipient');
  const repository = new SQLiteMessagingRepository(db, DEFAULT_MESSAGING_POLICY);
  let releaseImage!: () => void;
  let markImageStarted!: () => void;
  const imageStarted = new Promise<void>((resolve) => { markImageStarted = resolve; });
  const imageBlocked = new Promise<void>((resolve) => { releaseImage = resolve; });
  const media: MessageMediaStorage = {
    async prepare(files) {
      if (files.length > 0) {
        markImageStarted();
        await imageBlocked;
      }
      return null;
    },
    async isEquivalent() { return true; },
    async discard() {},
    urlFor(storageKey) { return `/api/messaging/media/${storageKey}`; },
    adminUrlFor(storageKey) { return `/api/admin/messaging/media/${storageKey}`; },
    async getForParticipant() { return null; },
    async getForAdmin() { return null; },
    async cleanupOrphans() { return 0; },
  };
  let clock = new Date('2026-07-31T08:00:00.000Z');
  const service = new MessagingApplicationService(
    repository,
    media,
    profileReader,
    DEFAULT_MESSAGING_POLICY,
    () => new Date(clock),
  );

  const slowImage = service.send({
    senderUserId: sender,
    recipientUserId: recipient,
    clientMessageId: randomUUID(),
    images: [new File(['image'], 'slow.png', { type: 'image/png' })],
  });
  await imageStarted;

  clock = new Date('2026-07-31T08:00:01.000Z');
  const fastText = await service.send({
    senderUserId: sender,
    recipientUserId: recipient,
    clientMessageId: randomUUID(),
    text: '后开始、先提交的文本',
  });
  clock = new Date('2026-07-31T08:00:02.000Z');
  releaseImage();
  const committedImage = await slowImage;

  expect(fastText.id).toBeLessThan(committedImage.id);
  const messages = await db.select().from(schema.messages);
  const textFact = messages.find((message) => message.id === fastText.id)!;
  const imageFact = messages.find((message) => message.id === committedImage.id)!;
  expect(textFact.createdAt).toEqual(new Date('2026-07-31T08:00:01.000Z'));
  expect(imageFact.createdAt).toEqual(new Date('2026-07-31T08:00:02.000Z'));

  const staleCommit = await repository.commitMessage({
    senderUserId: recipient,
    recipientUserId: sender,
    clientMessageId: randomUUID(),
    text: '陈旧调用方时间戳',
    media: null,
    createdAt: new Date('2026-07-31T07:59:59.000Z'),
  });
  expect(staleCommit.message.createdAt).toEqual(imageFact.createdAt);
  const conversation = (await db.select().from(schema.conversations))[0]!;
  expect(conversation.lastMessageId).toBe(staleCommit.message.id);
  expect(conversation.updatedAt).toEqual(imageFact.createdAt);
});
