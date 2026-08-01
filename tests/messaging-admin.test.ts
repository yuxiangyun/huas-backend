/**
 * [INPUT]: 依赖真实根 composition、Messaging/Operations 公开入口、后台 Cookie 会话、Bearer JWT 与隔离 SQLite/媒体目录
 * [OUTPUT]: 验证管理员会话增量/三态消息/图片只读、三类读取隐私审计、参与者鉴权、禁止管理写命令与四类媒体清理装配
 * [POS]: tests 的 Messaging 跨模块装配回归，证明 Operations 复用领域游标且每次敏感读取都有最小审计事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import sharp from 'sharp';
import { createApp } from '../src/app';
import { generateToken } from '../src/auth/jwt';
import { createApplicationComposition } from '../src/composition';
import { getDb, schema } from '../src/db';
import { Logger } from '../src/utils/logger';
import { clearSocialTestData } from './social-database';

const composition = createApplicationComposition();
const db = getDb();
const messageMediaRoot = join((globalThis as any).__HUAS_TEST_ROOT__, 'message-media');

afterAll(() => composition.dispose());

beforeEach(async () => {
  await clearSocialTestData(db);
  await rm(messageMediaRoot, { recursive: true, force: true });
});

function createHttpApp() {
  const app = new Hono();
  composition.app.registerRoutes(app);
  return app;
}

async function loginAdmin(app: Hono) {
  const response = await app.request('http://localhost/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'test-admin-password' }),
  });
  expect(response.status).toBe(200);
  return (response.headers.get('set-cookie') || '').split(';')[0];
}

async function seedUsers() {
  return db.insert(schema.users).values([
    { studentId: 'message-admin-1', className: '软工24101班' },
    { studentId: 'message-admin-2', className: '计科24101班' },
    { studentId: 'message-admin-3', className: '网工24101班' },
  ]).returning({ id: schema.users.id, studentId: schema.users.studentId });
}

describe('Messaging Operations read-only boundary', () => {
  it('registers independent orphan media cleanup tasks in the root periodic registry', async () => {
    expect(await composition.periodicTasks.runNow('orphan-message-media-cleanup')).toBe(true);
    expect(await composition.periodicTasks.runNow('orphan-discover-media-cleanup')).toBe(true);
    expect(await composition.periodicTasks.runNow('orphan-community-avatar-cleanup')).toBe(true);
    expect(await composition.periodicTasks.runNow('orphan-treehole-media-cleanup')).toBe(true);
    await expect(composition.periodicTasks.runNow('read-notification-cleanup'))
      .rejects.toThrow('not registered');
  });

  it('lets administrators read every conversation, text and private image without exposing mutations', async () => {
    const users = await seedUsers();
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: '#336699ff' },
    }).png().toBuffer();
    const sent = await composition.social.messaging.service.send({
      senderUserId: users[0].id,
      recipientUserId: users[1].id,
      clientMessageId: '11111111-1111-4111-8111-111111111111',
      text: '仅管理员与参与者可见',
      images: [new File([png], 'private.png', { type: 'image/png' })],
    });

    const app = createHttpApp();
    const cookie = await loginAdmin(app);
    const headers = { Cookie: cookie };
    const conversationsResponse = await app.request(
      'http://localhost/api/admin/messaging/conversations',
      { headers },
    );
    expect(conversationsResponse.status).toBe(200);
    const conversations = await conversationsResponse.json() as any;
    expect(conversations.data.items).toHaveLength(1);
    expect(conversations.data.items[0].lastMessage.text).toBe('仅管理员与参与者可见');

    const messagesResponse = await app.request(
      `http://localhost/api/admin/messaging/conversations/${sent.conversationId}/messages`,
      { headers },
    );
    expect(messagesResponse.status).toBe(200);
    const messages = await messagesResponse.json() as any;
    expect(messages.data.items[0].text).toBe('仅管理员与参与者可见');
    expect(messages.data.items[0].clientMessageId)
      .toBe('11111111-1111-4111-8111-111111111111');
    const adminMediaUrl = messages.data.items[0].images[0].url as string;
    expect(adminMediaUrl.startsWith('/api/admin/messaging/media/')).toBe(true);

    const mediaResponse = await app.request(`http://localhost${adminMediaUrl}`, { headers });
    expect(mediaResponse.status).toBe(200);
    expect(mediaResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(mediaResponse.headers.get('content-type')).toContain('image/webp');
    expect((await mediaResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const unauthenticated = await app.request(`http://localhost${adminMediaUrl}`);
    expect(unauthenticated.status).toBe(401);
    expect((await app.request(
      `http://localhost/api/admin/messaging/conversations/${sent.conversationId}`,
      { method: 'DELETE', headers },
    )).status).toBe(404);
    expect((await app.request(
      `http://localhost/api/admin/messaging/conversations/${sent.conversationId}/messages`,
      { method: 'POST', headers },
    )).status).toBe(404);
    expect((await app.request(
      `http://localhost/api/admin/messaging/conversations/${sent.conversationId}/messages`,
      { method: 'PUT', headers },
    )).status).toBe(404);
    expect((await app.request(
      `http://localhost/api/admin/messaging/conversations/${sent.conversationId}/messages`,
      { method: 'PATCH', headers },
    )).status).toBe(404);
    expect((await app.request(
      `http://localhost/api/admin/messaging/conversations/${sent.conversationId}/messages`,
      { method: 'DELETE', headers },
    )).status).toBe(404);
    expect((await app.request(
      `http://localhost/api/admin/messaging/conversations/${sent.conversationId}/messages?beforeMessageId=${sent.id}&afterMessageId=${sent.id}`,
      { headers },
    )).status).toBe(400);
  });

  it('audits conversation, message and media reads without message or user privacy', async () => {
    const users = await seedUsers();
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: '#778899ff' },
    }).png().toBuffer();
    const secretText = 'audit-must-not-contain-this-message';
    const secretFileName = 'audit-must-not-contain-this-original-name.png';
    const sent = await composition.social.messaging.service.send({
      senderUserId: users[0].id,
      recipientUserId: users[1].id,
      clientMessageId: '44444444-4444-4444-8444-444444444444',
      text: secretText,
      images: [new File([png], secretFileName, { type: 'image/png' })],
    });
    const storageKey = (await db.select({ storageKey: schema.messageImages.storageKey })
      .from(schema.messageImages))[0]!.storageKey;
    const app = createHttpApp();
    const cookie = await loginAdmin(app);
    const headers = { Cookie: cookie };
    const auditLog = spyOn(Logger, 'operation').mockImplementation(() => undefined);
    let calls: unknown[][] = [];
    try {
      expect((await app.request(
        'http://localhost/api/admin/messaging/conversations',
        { headers },
      )).status).toBe(200);
      expect((await app.request(
        `http://localhost/api/admin/messaging/conversations/${sent.conversationId}/messages`,
        { headers },
      )).status).toBe(200);
      expect((await app.request(
        `http://localhost/api/admin/messaging/media/${storageKey}`,
        { headers },
      )).status).toBe(200);
      calls = auditLog.mock.calls.map((call) => [...call]);
    } finally {
      auditLog.mockRestore();
    }

    expect(calls).toEqual([
      ['AdminMessagingAudit', 'read_conversation_list', 'test-admin', '管理员'],
      [
        'AdminMessagingAudit',
        'read_conversation_messages',
        'test-admin',
        '管理员',
        `conversationId=${sent.conversationId}`,
      ],
      [
        'AdminMessagingAudit',
        'read_message_media',
        'test-admin',
        '管理员',
        `conversationId=${sent.conversationId}; storageKey=${storageKey}`,
      ],
    ]);
    const serialized = JSON.stringify(calls);
    expect(serialized).not.toContain(secretText);
    expect(serialized).not.toContain(secretFileName);
    expect(serialized).not.toContain(users[0].studentId);
    expect(serialized).not.toContain(users[1].studentId);
  });

  it('serves message media only to conversation participants through Bearer routes', async () => {
    const users = await seedUsers();
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#ffffff' },
    }).png().toBuffer();
    const sent = await composition.social.messaging.service.send({
      senderUserId: users[0].id,
      recipientUserId: users[1].id,
      clientMessageId: '22222222-2222-4222-8222-222222222222',
      images: [new File([png], 'participant.png', { type: 'image/png' })],
    });
    const mediaUrl = sent.images[0].url;
    const [participantToken, outsiderToken] = await Promise.all([
      generateToken({ userId: users[1].id, studentId: users[1].studentId }),
      generateToken({ userId: users[2].id, studentId: users[2].studentId }),
    ]);
    const app = createHttpApp();

    const participant = await app.request(`http://localhost${mediaUrl}`, {
      headers: { Authorization: `Bearer ${participantToken}` },
    });
    expect(participant.status).toBe(200);
    expect(participant.headers.get('cache-control')).toBe('private, no-store');
    const outsider = await app.request(`http://localhost${mediaUrl}`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(outsider.status).toBe(404);
    expect((await app.request(`http://localhost${mediaUrl}`)).status).toBe(401);
  });

  it('keeps message text and original image names out of operation and access logs', async () => {
    const users = await seedUsers();
    const token = await generateToken({ userId: users[0].id, studentId: users[0].studentId });
    const secretText = 'secret-message-body-must-never-enter-logs';
    const secretFileName = 'secret-original-name-must-never-enter-logs.png';
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#000000' },
    }).png().toBuffer();
    const form = new FormData();
    form.set('text', secretText);
    form.append('images', new File([png], secretFileName, { type: 'image/png' }));
    const operationLog = spyOn(Logger, 'operation').mockImplementation(() => undefined);
    const accessLog = spyOn(Logger, 'http').mockImplementation(() => undefined);
    try {
      const app = createApp(composition.app, { development: false });
      const response = await app.request(
        `http://localhost/api/messaging/users/${users[1].id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': '33333333-3333-4333-8333-333333333333',
          },
          body: form,
        },
      );
      expect(response.status).toBe(200);
      const serializedLogs = JSON.stringify([
        ...operationLog.mock.calls,
        ...accessLog.mock.calls,
      ]);
      expect(serializedLogs).not.toContain(secretText);
      expect(serializedLogs).not.toContain(secretFileName);
      expect(operationLog).toHaveBeenCalledTimes(1);
      expect(accessLog).toHaveBeenCalledTimes(1);
    } finally {
      operationLog.mockRestore();
      accessLog.mockRestore();
    }
  });
});
