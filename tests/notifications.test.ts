/**
 * [INPUT]: 依赖 Notifications 纵向切片、注入式 CommunityProfileReader、Hono 与显式迁移的隔离 SQLite
 * [OUTPUT]: 覆盖回复差异类型、Outbox 幂等/撤销/退避、actor 投影、ID 增量轮询、逐条已读与永久保留
 * [POS]: tests 的 Notifications 专项回归，锁定 UGC 共用事件语义与 offset 翻页之外的稳定轮询边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { getDb, schema } from '../src/db';
import { ActivityOutboxProjector } from '../src/modules/notifications/application/activity-outbox-projector';
import { createNotificationsModule } from '../src/modules/notifications/composition';
import {
  createActivityEvents,
  createCommentActivityEvents,
  type ActivityEvent,
} from '../src/modules/notifications/domain/activity';
import { DEFAULT_NOTIFICATIONS_POLICY } from '../src/modules/notifications/domain/notification';
import type {
  ActivityOutboxStore,
  PendingActivityEvent,
} from '../src/modules/notifications/domain/ports';
import type { CommunityProfile } from '../src/modules/community/domain/community';
import type { CommunityProfileReader } from '../src/modules/community/domain/ports';
import { clearSocialTestData } from './social-database';

const db = getDb();
const projectedProfiles = new Map<number, CommunityProfile>();
let profileBatches: number[][] = [];
let recipientUserId = 0;
let otherRecipientUserId = 0;
let firstActorUserId = 0;
let secondActorUserId = 0;

const profileReader: CommunityProfileReader = {
  async getMany(userIds) {
    const uniqueIds = Array.from(new Set(userIds));
    profileBatches.push(uniqueIds);
    return new Map(uniqueIds.flatMap((userId) => {
      const profile = projectedProfiles.get(userId);
      return profile ? [[userId, profile] as const] : [];
    }));
  },
};

const notifications = createNotificationsModule({ db, profileReader });

async function createUser(studentId: string) {
  const now = new Date();
  const rows = await db.insert(schema.users).values({
    studentId,
    name: `真实姓名-${studentId}`,
    className: '软工24101班',
    createdAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
  }).returning({ id: schema.users.id });
  return rows[0]!.id;
}

function createLikeEvent(
  actorUserId = firstActorUserId,
  recipientId = recipientUserId,
): ActivityEvent {
  return createActivityEvents({
    actorUserId,
    recipientUserIds: [recipientId],
    type: 'discover_like',
    resourceType: 'discover_post',
    resourceId: 101,
    createdAt: new Date('2026-07-31T02:00:00.000Z'),
  })[0]!;
}

async function enqueue(events: readonly ActivityEvent[]) {
  return db.transaction((transaction) => notifications.outboxWriter.enqueue(transaction, events));
}

function createHttpApp() {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('userId', Number(c.req.header('x-test-user-id')));
    await next();
  });
  app.route('/notifications', notifications.routes);
  return app;
}

beforeEach(async () => {
  await clearSocialTestData(db);
  projectedProfiles.clear();
  profileBatches = [];
  recipientUserId = await createUser('notifications-recipient');
  otherRecipientUserId = await createUser('notifications-other');
  firstActorUserId = await createUser('notifications-actor-1');
  secondActorUserId = await createUser('notifications-actor-2');
  projectedProfiles.set(firstActorUserId, {
    id: firstActorUserId,
    displayName: '公开演员甲',
    avatarUrl: '/media/treehole-avatar/actor-a.webp',
  });
  projectedProfiles.set(secondActorUserId, {
    id: secondActorUserId,
    displayName: '公开演员乙',
    avatarUrl: null,
  });
});

describe('Notifications activity event contract', () => {
  test('deduplicates recipients, removes self-interaction and includes recipient in stable eventId', () => {
    const events = createActivityEvents({
      actorUserId: firstActorUserId,
      recipientUserIds: [recipientUserId, recipientUserId, firstActorUserId, otherRecipientUserId],
      type: 'treehole_comment_reply',
      resourceType: 'treehole_post',
      resourceId: 11,
      subresourceId: 29,
      createdAt: new Date('2026-07-31T01:00:00.000Z'),
    });

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.recipientUserId)).toEqual([
      recipientUserId,
      otherRecipientUserId,
    ]);
    expect(events[0]!.eventId).not.toBe(events[1]!.eventId);
    expect(events[0]!.eventId).toContain(`:${recipientUserId}`);
    expect(Object.keys(events[0]!).sort()).toEqual([
      'actorUserId',
      'createdAt',
      'eventId',
      'recipientUserId',
      'resourceId',
      'resourceType',
      'subresourceId',
      'type',
    ]);
    expect(() => createActivityEvents({
      actorUserId: firstActorUserId,
      recipientUserIds: [recipientUserId],
      type: 'discover_comment',
      resourceType: 'discover_post',
      resourceId: 1,
    })).toThrow('subresourceId');
  });

  test('assigns reply to the parent author and comment to a distinct post author', () => {
    const events = createCommentActivityEvents({
      actorUserId: firstActorUserId,
      postAuthorUserId: recipientUserId,
      parentCommentAuthorUserId: otherRecipientUserId,
      resourceType: 'discover_post',
      resourceId: 71,
      commentId: 72,
    });
    expect(events.map(({ recipientUserId, type }) => ({ recipientUserId, type }))).toEqual([
      { recipientUserId: otherRecipientUserId, type: 'discover_comment_reply' },
      { recipientUserId, type: 'discover_comment' },
    ]);

    const sameRecipient = createCommentActivityEvents({
      actorUserId: firstActorUserId,
      postAuthorUserId: recipientUserId,
      parentCommentAuthorUserId: recipientUserId,
      resourceType: 'treehole_post',
      resourceId: 81,
      commentId: 82,
    });
    expect(sameRecipient).toHaveLength(1);
    expect(sameRecipient[0]).toMatchObject({
      recipientUserId,
      type: 'treehole_comment_reply',
    });

    const postAuthorReply = createCommentActivityEvents({
      actorUserId: recipientUserId,
      postAuthorUserId: recipientUserId,
      parentCommentAuthorUserId: otherRecipientUserId,
      resourceType: 'treehole_post',
      resourceId: 91,
      commentId: 92,
    });
    expect(postAuthorReply).toHaveLength(1);
    expect(postAuthorReply[0]).toMatchObject({
      recipientUserId: otherRecipientUserId,
      type: 'treehole_comment_reply',
    });
  });
});

describe('Notifications transactional outbox', () => {
  test('enqueues and projects an event idempotently', async () => {
    const event = createLikeEvent();

    expect(await enqueue([event, event])).toBe(1);
    expect(await enqueue([event])).toBe(0);
    expect(await db.select().from(schema.activityOutbox)).toHaveLength(1);

    expect(await notifications.projector.runOnce()).toEqual({ selected: 1, projected: 1, failed: 0 });
    expect(await db.select().from(schema.activityOutbox)).toHaveLength(0);
    expect(await db.select().from(schema.notifications)).toHaveLength(1);

    expect(await enqueue([event])).toBe(1);
    await notifications.projector.runOnce();
    const rows = await db.select().from(schema.notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventId).toBe(event.eventId);
  });

  test('unlike deletes both pending and projected forms and permits a later re-like', async () => {
    const event = createLikeEvent();
    await enqueue([event]);
    await notifications.projector.runOnce();

    await db.transaction((transaction) => notifications.outboxWriter.removeLike(
      transaction,
      event.eventId,
    ));
    expect(await db.select().from(schema.activityOutbox)).toHaveLength(0);
    expect(await db.select().from(schema.notifications)).toHaveLength(0);

    await enqueue([event]);
    await db.transaction((transaction) => notifications.outboxWriter.removeLike(
      transaction,
      event.eventId,
    ));
    expect(await notifications.projector.runOnce()).toEqual({ selected: 0, projected: 0, failed: 0 });

    await enqueue([event]);
    await notifications.projector.runOnce();
    expect(await db.select().from(schema.notifications)).toHaveLength(1);
  });

  test('records exponential backoff and retries only after nextAttemptAt', async () => {
    const event: PendingActivityEvent = {
      ...createLikeEvent(),
      outboxId: 9,
      attemptCount: 0,
    };
    let nextAttemptAt: Date | null = null;
    let projectionCalls = 0;
    let projected = false;
    const store: ActivityOutboxStore = {
      async listPending(now) {
        return !projected && (!nextAttemptAt || nextAttemptAt <= now) ? [event] : [];
      },
      async project() {
        projectionCalls += 1;
        if (projectionCalls === 1) throw new Error('temporary projection failure');
        projected = true;
        return true;
      },
      async recordFailure(current, error, retryAt) {
        expect(error).toBe('temporary projection failure');
        current.attemptCount += 1;
        nextAttemptAt = retryAt;
      },
    };
    const projector = new ActivityOutboxProjector(store, {
      ...DEFAULT_NOTIFICATIONS_POLICY,
      retryBaseDelayMs: 1_000,
      retryMaxDelayMs: 8_000,
    });
    const now = new Date('2026-07-31T00:00:00.000Z');

    expect(await projector.runOnce(now)).toEqual({ selected: 1, projected: 0, failed: 1 });
    expect(nextAttemptAt).toEqual(new Date(now.getTime() + 1_000));
    expect(await projector.runOnce(new Date(now.getTime() + 999)))
      .toEqual({ selected: 0, projected: 0, failed: 0 });
    expect(await projector.runOnce(new Date(now.getTime() + 1_000)))
      .toEqual({ selected: 1, projected: 1, failed: 0 });
  });
});

describe('Notifications user read model', () => {
  test('batch-projects actors, isolates recipients and marks exactly one notification read', async () => {
    const first = createLikeEvent(firstActorUserId);
    const second = createActivityEvents({
      actorUserId: secondActorUserId,
      recipientUserIds: [recipientUserId],
      type: 'treehole_comment',
      resourceType: 'treehole_post',
      resourceId: 202,
      subresourceId: 303,
      createdAt: new Date('2026-07-31T03:00:00.000Z'),
    })[0]!;
    await enqueue([first, second]);
    await notifications.projector.runOnce();
    const app = createHttpApp();

    const listResponse = await app.request('http://localhost/notifications?page=1&pageSize=20', {
      headers: { 'x-test-user-id': String(recipientUserId) },
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json() as any;
    expect(listBody.data.total).toBe(2);
    expect(listBody.data.items.map((item: any) => item.actor.displayName))
      .toEqual(['公开演员乙', '公开演员甲']);
    expect(profileBatches).toEqual([[secondActorUserId, firstActorUserId]]);
    expect(Object.keys(listBody.data.items[0].actor).sort()).toEqual(['avatarUrl', 'displayName', 'id']);
    expect(JSON.stringify(listBody.data)).not.toContain('eventId');
    expect(JSON.stringify(listBody.data)).not.toContain('recipientUserId');
    expect(JSON.stringify(listBody.data)).not.toContain('真实姓名');

    const unread = await app.request('http://localhost/notifications/unread-count', {
      headers: { 'x-test-user-id': String(recipientUserId) },
    });
    expect((await unread.json() as any).data.unreadCount).toBe(2);

    const notificationId = listBody.data.items[0].id;
    const forbidden = await app.request(`http://localhost/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: { 'x-test-user-id': String(otherRecipientUserId) },
    });
    expect(forbidden.status).toBe(404);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const marked = await app.request(`http://localhost/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: { 'x-test-user-id': String(recipientUserId) },
      });
      expect(marked.status).toBe(200);
    }
    expect(await notifications.service.countUnread(recipientUserId)).toBe(1);
    expect(await notifications.service.countUnread(otherRecipientUserId)).toBe(0);
  });

  test('polls inserted notifications by stable ID high-water without deleting old read facts', async () => {
    await enqueue([createLikeEvent(firstActorUserId)]);
    await notifications.projector.runOnce();
    const first = (await db.select().from(schema.notifications))[0]!;
    await notifications.service.markRead(recipientUserId, first.id);

    const later = createActivityEvents({
      actorUserId: secondActorUserId,
      recipientUserIds: [recipientUserId],
      type: 'treehole_comment',
      resourceType: 'treehole_post',
      resourceId: 202,
      subresourceId: 303,
    })[0]!;
    await enqueue([later]);
    await notifications.projector.runOnce();

    const app = createHttpApp();
    const changesResponse = await app.request(
      `http://localhost/notifications/changes?afterNotificationId=${first.id}&limit=1`,
      { headers: { 'x-test-user-id': String(recipientUserId) } },
    );
    expect(changesResponse.status).toBe(200);
    const changes = (await changesResponse.json() as any).data;
    expect(changes.items).toHaveLength(1);
    expect(changes.items[0]).toMatchObject({ type: 'treehole_comment' });
    expect(changes.afterNotificationId).toBe(changes.items[0].id);
    expect(changes.hasMore).toBe(false);

    const repeated = await app.request(
      `http://localhost/notifications/changes?afterNotificationId=${first.id}&limit=1`,
      { headers: { 'x-test-user-id': String(recipientUserId) } },
    );
    expect((await repeated.json() as any).data.items[0].id).toBe(changes.items[0].id);
    const caughtUp = await app.request(
      `http://localhost/notifications/changes?afterNotificationId=${changes.afterNotificationId}`,
      { headers: { 'x-test-user-id': String(recipientUserId) } },
    );
    expect((await caughtUp.json() as any).data).toEqual({
      items: [],
      afterNotificationId: changes.afterNotificationId,
      hasMore: false,
    });
    expect(await db.select().from(schema.notifications)).toHaveLength(2);
    expect('cleanup' in notifications).toBe(false);
  });
});
