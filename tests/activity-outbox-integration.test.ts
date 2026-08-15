/**
 * [INPUT]: 依赖 Discover/Treehole SQLite 写 adapters、Treehole 媒体 URL stub、真实 Notifications Outbox writer、隔离 SQLite 与失败注入
 * [OUTPUT]: 证明点赞/评论事实、派生计数和 activity_outbox 在 writer 失败时共同回滚，并验证提交后投影失败可由重试恢复
 * [POS]: tests 的跨模块 transactional Outbox 原子性门禁，直接验证内容事务而不经过 HTTP 或异步 projector
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import type { CommunityProfileReader } from '../src/modules/community/domain/ports';
import { createDiscoverModule } from '../src/modules/discover/composition';
import {
  DiscoverPostQuery,
  SQLiteDiscoverPostService,
} from '../src/modules/discover/infrastructure/sqlite-discover-post-service';
import { createNotificationsModule } from '../src/modules/notifications/composition';
import type { ActivityOutboxWriter } from '../src/modules/notifications/domain/ports';
import type { TreeholeMediaReader } from '../src/modules/treehole/domain/ports';
import { SQLiteTreeholeUserPersistence } from '../src/modules/treehole/infrastructure/sqlite-treehole-user-persistence';
import type { TreeholeTransaction } from '../src/modules/treehole/infrastructure/sqlite-treehole-support';
import type { DiscoverTransaction } from '../src/modules/discover/infrastructure/discover-mapping';
import { clearSocialTestData } from './social-database';

const db = getDb();
const profiles: CommunityProfileReader = {
  async getMany(userIds) {
    return new Map(userIds.map((id) => [id, { id, displayName: `用户${id}`, avatarUrl: null }]));
  },
};
const treeholeMediaReader: TreeholeMediaReader = {
  userUrlFor(mediaKey, fileName) { return `/api/treehole/media/${mediaKey}/${fileName}`; },
  adminUrlFor(mediaKey, fileName) { return `/api/admin/treehole/media/${mediaKey}/${fileName}`; },
  async getForUser() { return null; },
  async getForAdmin() { return null; },
};
async function createUser(studentId: string): Promise<number> {
  const now = new Date();
  const rows = await db.insert(schema.users).values({
    studentId,
    name: studentId,
    className: '软工24101班',
    createdAt: now,
    lastLoginAt: now,
    lastActiveAt: now,
  }).returning({ id: schema.users.id });
  return rows[0]!.id;
}

function failingAfterRealEnqueue<TTransaction>(
  real: ActivityOutboxWriter<TTransaction>,
): ActivityOutboxWriter<TTransaction> {
  return {
    enqueue(transaction, events) {
      real.enqueue(transaction, events);
      throw new Error('injected outbox failure');
    },
    removeLike(transaction, eventId) {
      return real.removeLike(transaction, eventId);
    },
    removeResource(transaction, resourceType, resourceId) {
      return real.removeResource(transaction, resourceType, resourceId);
    },
    removeSubresource(transaction, resourceType, resourceId, subresourceId) {
      return real.removeSubresource(transaction, resourceType, resourceId, subresourceId);
    },
  };
}

beforeEach(async () => {
  await clearSocialTestData(db);
});

describe('transactional activity outbox integration', () => {
  test('rolls Discover like fact, count and outbox back together', async () => {
    const authorUserId = await createUser('outbox-discover-author');
    const actorUserId = await createUser('outbox-discover-actor');
    const now = new Date();
    const posts = await db.insert(schema.discoverPosts).values({
      userId: authorUserId,
      title: '原子性点赞',
      content: '测试',
      category: '其他',
      storageKey: 'outbox-atomic-discover',
      imagesJson: '[]',
      tagsJson: '[]',
      coverUrl: '/media/discover/outbox-atomic-discover/01.webp',
      imageCount: 0,
      commentCount: 0,
      likeCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      deletedAt: null,
    }).returning({ id: schema.discoverPosts.id });
    const notifications = createNotificationsModule({ db, profileReader: profiles });
    const postQuery = new DiscoverPostQuery(db, profiles);
    const service = new SQLiteDiscoverPostService(
      db,
      postQuery,
      failingAfterRealEnqueue<DiscoverTransaction>(notifications.outboxWriter),
    );

    await expect(service.like(actorUserId, posts[0]!.id)).rejects.toThrow('injected outbox failure');
    expect(await db.select().from(schema.discoverPostLikes)).toHaveLength(0);
    expect(await db.select().from(schema.activityOutbox)).toHaveLength(0);
    const persisted = await db.select({ likeCount: schema.discoverPosts.likeCount })
      .from(schema.discoverPosts)
      .where(eq(schema.discoverPosts.id, posts[0]!.id));
    expect(persisted[0]!.likeCount).toBe(0);
  });

  test('rolls Treehole comment fact, count and outbox back together', async () => {
    const authorUserId = await createUser('outbox-treehole-author');
    const actorUserId = await createUser('outbox-treehole-actor');
    const now = new Date();
    const posts = await db.insert(schema.treeholePosts).values({
      userId: authorUserId,
      content: '原子性评论',
      likeCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      deletedAt: null,
    }).returning({ id: schema.treeholePosts.id });
    const notifications = createNotificationsModule({ db, profileReader: profiles });
    const persistence = new SQLiteTreeholeUserPersistence(
      db,
      profiles,
      treeholeMediaReader,
      failingAfterRealEnqueue<TreeholeTransaction>(notifications.outboxWriter),
    );

    await expect(persistence.createComment({
      postId: posts[0]!.id,
      userId: actorUserId,
      content: '事务必须回滚',
      parentCommentId: null,
    })).rejects.toThrow('injected outbox failure');
    expect(await db.select().from(schema.treeholeComments)).toHaveLength(0);
    expect(await db.select().from(schema.activityOutbox)).toHaveLength(0);
    const persisted = await db.select({ commentCount: schema.treeholePosts.commentCount })
      .from(schema.treeholePosts)
      .where(eq(schema.treeholePosts.id, posts[0]!.id));
    expect(persisted[0]!.commentCount).toBe(0);
  });

  test('keeps a committed interaction pending when immediate projection fails, then retries it', async () => {
    const authorUserId = await createUser('outbox-retry-author');
    const actorUserId = await createUser('outbox-retry-actor');
    const now = new Date();
    const posts = await db.insert(schema.discoverPosts).values({
      userId: authorUserId,
      title: '提交后投影失败',
      content: '稍后重试',
      category: '其他',
      storageKey: 'outbox-retry-discover',
      imagesJson: '[]',
      tagsJson: '[]',
      coverUrl: '/media/discover/outbox-retry-discover/01.webp',
      imageCount: 0,
      commentCount: 0,
      likeCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      deletedAt: null,
    }).returning({ id: schema.discoverPosts.id });
    const notifications = createNotificationsModule({ db, profileReader: profiles });
    const discover = createDiscoverModule({
      db,
      profileReader: profiles,
      activityOutbox: notifications.outboxWriter,
      activityProjection: {
        async attempt() {
          throw new Error('projector temporarily unavailable');
        },
      },
    });

    await expect(discover.service.likePost(actorUserId, posts[0]!.id)).resolves.toMatchObject({
      id: posts[0]!.id,
      likeCount: 1,
    });
    expect(await db.select().from(schema.discoverPostLikes)).toHaveLength(1);
    expect(await db.select().from(schema.activityOutbox)).toHaveLength(1);
    expect(await db.select().from(schema.notifications)).toHaveLength(0);

    expect(await notifications.projector.runOnce()).toEqual({ selected: 1, projected: 1, failed: 0 });
    expect(await db.select().from(schema.activityOutbox)).toHaveLength(0);
    expect(await db.select().from(schema.notifications)).toHaveLength(1);
  });
});
