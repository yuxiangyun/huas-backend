import { beforeAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { initDatabase, getDb, schema } from '../src/db';
import { registerRoutes } from '../src/routes';
import { AdminDashboardService } from '../src/services/admin/dashboard-service';

beforeAll(() => {
  initDatabase();
});

describe('public announcements route', () => {
  it('GET /api/public/announcements should return announcements without auth', async () => {
    const app = new Hono();
    registerRoutes(app);

    const res = await app.request('http://localhost/api/public/announcements');
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const announcement = body.data[0];
    expect(typeof announcement.id).toBe('string');
    expect(typeof announcement.title).toBe('string');
    expect(typeof announcement.content).toBe('string');
    expect(typeof announcement.date).toBe('string');
    expect(['info', 'warning', 'error']).toContain(announcement.type);
  });

  it('GET /api/schedule should still require auth', async () => {
    const app = new Hono();
    registerRoutes(app);

    const res = await app.request('http://localhost/api/schedule');
    expect(res.status).toBe(401);

    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_code).toBe(4001);
  });
});

describe('admin dashboard 年级解析', () => {
  async function clearUserTables() {
    const db = getDb();
    await db.delete(schema.treeholeCommentNotifications);
    await db.delete(schema.treeholePostLikes);
    await db.delete(schema.treeholeComments);
    await db.delete(schema.treeholePosts);
    await db.delete(schema.discoverPostRatings);
    await db.delete(schema.discoverPosts);
    await db.delete(schema.credentials);
    await db.delete(schema.cache);
    await db.delete(schema.users);
  }

  async function createUser(studentId: string, name: string, className = '测试班') {
    const db = getDb();
    const now = new Date();
    await db.insert(schema.users).values({
      studentId,
      name,
      className,
      createdAt: now,
      lastLoginAt: now,
    });
  }

  it('统计支持数字学号和带前缀学号', async () => {
    await clearUserTables();
    await createUser('202401010404', 'user-a');
    await createUser('S202307020119', 'user-b');
    await createUser('Z202507020507', 'user-c');
    await createUser('ABCD00001', 'user-d');

    const data = await AdminDashboardService.getDashboard({ page: '1' });

    const byGrade = new Map(
      data.distributions.byGrade.map((item: any) => [item.grade, item.count])
    );

    expect(byGrade.get('2023')).toBe(1);
    expect(byGrade.get('2024')).toBe(1);
    expect(byGrade.get('2025')).toBe(1);
    expect(byGrade.has('ABCD')).toBe(false);
    expect(data.users.options.grades).toContain('2023');
    expect(data.users.options.grades).toContain('2024');
    expect(data.users.options.grades).toContain('2025');
  });

  it('按解析年级筛选，而不是学号前四位', async () => {
    await clearUserTables();
    await createUser('202401010404', 'user-a');
    await createUser('S202307020119', 'user-b');
    await createUser('Z202507020507', 'user-c');

    const data = await AdminDashboardService.getDashboard({ page: '1', grade: '2025' });
    expect(data.users.items.length).toBe(1);
    expect(data.users.items[0].studentId).toBe('Z202507020507');
    expect(data.users.items[0].grade).toBe('2025');
  });

  it('dashboard 返回 discover 管理数据', async () => {
    await clearUserTables();
    const db = getDb();
    const now = new Date();

    const insertedUsers = await db.insert(schema.users).values([
      {
        studentId: '2023001001',
        name: 'user-a',
        className: '软件工程2401班',
        createdAt: now,
        lastLoginAt: now,
      },
      {
        studentId: '2023001002',
        name: 'user-b',
        className: '计算机科学2401班',
        createdAt: now,
        lastLoginAt: now,
      },
    ]).returning({ id: schema.users.id });

    const authorId = insertedUsers[0].id as number;
    const raterId = insertedUsers[1].id as number;

    const insertedPosts = await db.insert(schema.discoverPosts).values({
      userId: authorId,
      title: '测试帖子',
      category: '其他',
      storageKey: 'test-storage',
      imagesJson: '[]',
      tagsJson: '["辣"]',
      coverUrl: '/media/discover/test-storage/01.webp',
      imageCount: 1,
      ratingCount: 1,
      ratingSum: 5,
      ratingAvg: 5,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      deletedAt: null,
    }).returning({ id: schema.discoverPosts.id });

    await db.insert(schema.discoverPostRatings).values({
      postId: insertedPosts[0].id,
      userId: raterId,
      score: 5,
      createdAt: now,
      updatedAt: now,
    });

    const data = await AdminDashboardService.getDashboard({ page: '1' });

    expect(data.metrics.totalDiscoverPosts).toBe(1);
    expect(data.metrics.totalDiscoverRatings).toBe(1);
    expect(data.discover.totalPosts).toBe(1);
    expect(data.discover.totalRatings).toBe(1);
    expect(data.discover.items).toHaveLength(1);
    expect(data.discover.items[0].title).toBe('测试帖子');
    expect(data.discover.items[0].authorLabel).toBe('软件工程');
    expect(data.discover.items[0].coverUrl).toBe('/media/discover/test-storage/01.webp');
    expect(data.discover.items[0].images).toEqual([]);
  });
});
