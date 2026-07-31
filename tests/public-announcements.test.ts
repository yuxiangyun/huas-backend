/**
 * [INPUT]: 依赖公告 canonical/Facade、公共路由、Dashboard、SQLite 测试库与隔离文件根
 * [OUTPUT]: 验证公告校验/原子替换/公共读取及 Dashboard 年级与 Discover 管理数据契约
 * [POS]: tests 的 Operations 公告与 Dashboard 兼容回归套件
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { getDb, schema } from '../src/db';
import { registerRoutes } from '../src/routes';
import { createApplicationComposition } from '../src/composition';
import { AnnouncementService } from '../src/services/content/announcement-service';
import { clearSocialTestData } from './social-database';

const composition = createApplicationComposition();
const AdminDashboardService = composition.operations.dashboard;
afterAll(() => composition.dispose());

const testRoot = (globalThis as { __HUAS_TEST_ROOT__: string }).__HUAS_TEST_ROOT__;
const announcementsDirectory = join(testRoot, 'data');
const announcementsFile = join(announcementsDirectory, 'announcements.json');
const initialAnnouncements = [
  {
    id: '20260307-1',
    title: '系统公告',
    content: '公告测试数据',
    date: '2026-03-07',
    type: 'info',
    createdAt: '2026-03-07T00:00:00.000+08:00',
    updatedAt: '2026-03-07T00:00:00.000+08:00',
  },
];

describe('announcement service 数据完整性', () => {
  beforeEach(async () => {
    await fsPromises.mkdir(announcementsDirectory, { recursive: true });
    await fsPromises.writeFile(announcementsFile, `${JSON.stringify(initialAnnouncements, null, 2)}\n`);
  });

  it('拒绝格式正确但不存在的日历日期', async () => {
    await expect(AnnouncementService.create({
      title: '非法日期',
      content: '不应写入',
      date: '2026-02-29',
      type: 'warning',
    })).rejects.toThrow('公告日期必须是 YYYY-MM-DD');

    const stored = JSON.parse(await fsPromises.readFile(announcementsFile, 'utf8'));
    expect(stored).toEqual(initialAnnouncements);
  });

  it('拒绝非对象输入并保留原文件', async () => {
    await expect(AnnouncementService.create(null as never)).rejects.toThrow('公告数据必须是对象');
    const stored = JSON.parse(await fsPromises.readFile(announcementsFile, 'utf8'));
    expect(stored).toEqual(initialAnnouncements);
  });

  it('删除最后一条公告后保持空列表', async () => {
    expect(await AnnouncementService.remove('20260307-1')).toBe(true);
    expect(await AnnouncementService.listAdmin()).toEqual([]);
    expect(JSON.parse(await fsPromises.readFile(announcementsFile, 'utf8'))).toEqual([]);
  });

  it('通过同目录临时文件原子替换公告数据', async () => {
    const renameSpy = spyOn(fsPromises, 'rename');
    try {
      await AnnouncementService.create({
        title: '原子写',
        content: '完整内容',
        date: '2024-02-29',
        type: ' info ',
      });

      const stored = JSON.parse(await fsPromises.readFile(announcementsFile, 'utf8'));
      const leftovers = await fsPromises.readdir(announcementsDirectory);
      expect(stored).toHaveLength(2);
      expect(stored.find((item: { title: string }) => item.title === '原子写')?.type).toBe('info');
      expect(renameSpy).toHaveBeenCalledTimes(1);
      expect(leftovers.some((name) => name.endsWith('.tmp'))).toBe(false);
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('原子替换失败时保留旧文件并清理临时文件', async () => {
    const original = await fsPromises.readFile(announcementsFile, 'utf8');
    const renameSpy = spyOn(fsPromises, 'rename').mockRejectedValueOnce(new Error('rename failed'));
    try {
      await expect(AnnouncementService.create({
        title: '失败写入',
        content: '不应覆盖旧文件',
        date: '2026-03-08',
        type: 'error',
      })).rejects.toThrow('rename failed');

      const leftovers = await fsPromises.readdir(announcementsDirectory);
      expect(await fsPromises.readFile(announcementsFile, 'utf8')).toBe(original);
      expect(leftovers.some((name) => name.endsWith('.tmp'))).toBe(false);
    } finally {
      renameSpy.mockRestore();
    }
  });
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
    await clearSocialTestData(db);
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
    const likerId = insertedUsers[1].id as number;

    const insertedPosts = await db.insert(schema.discoverPosts).values({
      userId: authorId,
      title: '测试帖子',
      category: '其他',
      storageKey: 'test-storage',
      imagesJson: '[]',
      tagsJson: '["辣"]',
      coverUrl: '/media/discover/test-storage/01.webp',
      imageCount: 1,
      likeCount: 1,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      deletedAt: null,
    }).returning({ id: schema.discoverPosts.id });

    await db.insert(schema.discoverPostLikes).values({
      postId: insertedPosts[0].id,
      userId: likerId,
      createdAt: now,
    });

    const data = await AdminDashboardService.getDashboard({ page: '1' });

    expect(data.metrics.totalDiscoverPosts).toBe(1);
    expect(data.metrics.totalDiscoverLikes).toBe(1);
    expect(data.discover.totalPosts).toBe(1);
    expect(data.discover.totalLikes).toBe(1);
    expect(data.discover.items).toHaveLength(1);
    expect(data.discover.items[0].title).toBe('测试帖子');
    expect(data.discover.items[0].authorDisplayName).toBe(`软件工程同学${authorId}`);
    expect(data.discover.items[0].coverUrl).toBe('/media/discover/test-storage/01.webp');
    expect(data.discover.items[0].images).toEqual([]);
  });
});
