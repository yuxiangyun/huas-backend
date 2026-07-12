/**
 * [INPUT]: 依赖 node:fs/promises 的文件读写与原子替换能力，依赖 utils/time 的北京时间格式化
 * [OUTPUT]: 对外提供 Announcement 类型与 AnnouncementService 公告读写服务
 * [POS]: services/content 的公告持久化边界，以同目录临时文件保护 JSON 数据完整性
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { beijingDate, beijingIsoString } from '../../utils/time';

export type AnnouncementType = 'info' | 'warning' | 'error';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
  type: AnnouncementType;
  createdAt: string;
  updatedAt: string;
}

interface AnnouncementPayload {
  title?: string;
  content?: string;
  date?: string;
  type?: string;
}

const STORAGE_ROOT = (globalThis as { __HUAS_TEST_ROOT__?: string }).__HUAS_TEST_ROOT__ ?? process.cwd();
const ANNOUNCEMENTS_FILE = resolve(STORAGE_ROOT, 'data/announcements.json');
const TYPE_SET = new Set<AnnouncementType>(['info', 'warning', 'error']);

const DEFAULT_ANNOUNCEMENTS: Announcement[] = [
  {
    id: '20260307-1',
    title: '系统公告',
    content: '公告弹窗功能已启用，请及时关注后续通知。',
    date: '2026-03-07',
    type: 'info',
    createdAt: '2026-03-07T00:00:00.000+08:00',
    updatedAt: '2026-03-07T00:00:00.000+08:00',
  },
];

let writeQueue = Promise.resolve();

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeDate(value?: string): string {
  if (value === undefined) return beijingDate();
  if (typeof value !== 'string') throw new Error('公告日期必须是 YYYY-MM-DD');
  const date = value.trim();
  if (!isValidDate(date)) {
    throw new Error('公告日期必须是 YYYY-MM-DD');
  }
  return date;
}

function normalizeType(value?: string): AnnouncementType {
  const type = typeof value === 'string' ? value.trim() : '';
  if (!TYPE_SET.has(type as AnnouncementType)) {
    throw new Error('公告类型必须是 info | warning | error');
  }
  return type as AnnouncementType;
}

function normalizeText(field: string, value?: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new Error(`${field} 不能为空`);
  }
  return text;
}

function sanitizeId(value: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

function assertPayload(payload: unknown): asserts payload is AnnouncementPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('公告数据必须是对象');
  }
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return beijingIsoString(parsed);
}

function generateId(date: string, existing: Announcement[]): string {
  const prefix = date.replace(/-/g, '');
  const used = new Set(existing.map((item) => item.id));
  let seq = 1;
  let id = `${prefix}-${seq}`;
  while (used.has(id)) {
    seq += 1;
    id = `${prefix}-${seq}`;
  }
  return id;
}

function sortAnnouncements(items: Announcement[]): Announcement[] {
  return items.slice().sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    const aTs = Date.parse(a.updatedAt);
    const bTs = Date.parse(b.updatedAt);
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) {
      return bTs - aTs;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function serialize(items: Announcement[]): string {
  return `${JSON.stringify(sortAnnouncements(items), null, 2)}\n`;
}

async function atomicWrite(content: string): Promise<void> {
  const directory = dirname(ANNOUNCEMENTS_FILE);
  const tempFile = join(directory, `.${basename(ANNOUNCEMENTS_FILE)}.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });

  try {
    await writeFile(tempFile, content, { encoding: 'utf8', flag: 'wx' });
    await rename(tempFile, ANNOUNCEMENTS_FILE);
  } catch (error) {
    await unlink(tempFile).catch(() => undefined);
    throw error;
  }
}

async function ensureAnnouncementsFile(): Promise<void> {
  await mkdir(dirname(ANNOUNCEMENTS_FILE), { recursive: true });
  try {
    await readFile(ANNOUNCEMENTS_FILE, 'utf8');
  } catch (error) {
    if (!isFileNotFound(error)) throw error;
    await atomicWrite(serialize(DEFAULT_ANNOUNCEMENTS));
  }
}

function toAnnouncement(raw: unknown): Announcement | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = sanitizeId(String(record.id ?? ''));
  const title = String(record.title ?? '').trim();
  const content = String(record.content ?? '').trim();
  const date = String(record.date ?? '').trim();
  const type = String(record.type ?? '').trim();
  if (!id || !title || !content || !isValidDate(date) || !TYPE_SET.has(type as AnnouncementType)) {
    return null;
  }
  const defaultCreatedAt = `${date}T00:00:00.000+08:00`;
  const createdAt = normalizeTimestamp(record.createdAt, defaultCreatedAt);
  const updatedAt = normalizeTimestamp(record.updatedAt, createdAt);
  return {
    id,
    title,
    content,
    date,
    type: type as AnnouncementType,
    createdAt,
    updatedAt,
  };
}

function parseAnnouncements(content: string): Announcement[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('公告数据文件不是有效的 JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('公告数据文件必须是数组');
  }

  const normalized = parsed
    .map(toAnnouncement)
    .filter((item): item is Announcement => item !== null);

  if (normalized.length !== parsed.length) {
    throw new Error('公告数据文件包含非法记录');
  }

  return sortAnnouncements(normalized);
}

async function readAll(): Promise<Announcement[]> {
  await ensureAnnouncementsFile();
  return parseAnnouncements(await readFile(ANNOUNCEMENTS_FILE, 'utf8'));
}

async function writeAll(items: Announcement[]): Promise<void> {
  await atomicWrite(serialize(items));
}

async function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
}

export class AnnouncementService {
  static async listPublic() {
    const items = await readAll();
    return items.map(({ id, title, content, date, type }) => ({ id, title, content, date, type }));
  }

  static async listAdmin() {
    return readAll();
  }

  static async create(payload: AnnouncementPayload): Promise<Announcement> {
    return withWriteLock(async () => {
      assertPayload(payload);
      const title = normalizeText('标题', payload.title);
      const content = normalizeText('内容', payload.content);
      const date = normalizeDate(payload.date);
      const type = normalizeType(payload.type);
      const items = await readAll();
      const now = beijingIsoString();

      const item: Announcement = {
        id: generateId(date, items),
        title,
        content,
        date,
        type,
        createdAt: now,
        updatedAt: now,
      };

      const next = [...items, item];
      await writeAll(next);
      return item;
    });
  }

  static async update(id: string, payload: AnnouncementPayload): Promise<Announcement | null> {
    return withWriteLock(async () => {
      assertPayload(payload);
      const cleanId = sanitizeId(id);
      if (!cleanId) {
        throw new Error('公告 ID 不能为空');
      }

      const items = await readAll();
      const index = items.findIndex((item) => item.id === cleanId);
      if (index < 0) return null;

      const current = items[index];
      const title = payload.title === undefined ? current.title : normalizeText('标题', payload.title);
      const content = payload.content === undefined ? current.content : normalizeText('内容', payload.content);
      const date = payload.date === undefined ? current.date : normalizeDate(payload.date);
      const type = payload.type === undefined ? current.type : normalizeType(payload.type);

      const nextItem: Announcement = {
        ...current,
        title,
        content,
        date,
        type,
        updatedAt: beijingIsoString(),
      };

      const nextItems = items.slice();
      nextItems[index] = nextItem;
      await writeAll(nextItems);
      return nextItem;
    });
  }

  static async remove(id: string): Promise<boolean> {
    return withWriteLock(async () => {
      const cleanId = sanitizeId(id);
      if (!cleanId) {
        throw new Error('公告 ID 不能为空');
      }

      const items = await readAll();
      const nextItems = items.filter((item) => item.id !== cleanId);
      if (nextItems.length === items.length) return false;

      await writeAll(nextItems);
      return true;
    });
  }
}
