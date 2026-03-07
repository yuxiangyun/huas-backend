import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { beijingDate, beijingIsoString } from '../utils/time';

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

const ANNOUNCEMENTS_FILE = resolve(process.cwd(), 'data/announcements.json');
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
  return !Number.isNaN(parsed.getTime());
}

function normalizeDate(value?: string): string {
  if (!value) return beijingDate();
  const date = value.trim();
  if (!isValidDate(date)) {
    throw new Error('公告日期必须是 YYYY-MM-DD');
  }
  return date;
}

function normalizeType(value?: string): AnnouncementType {
  if (!value || !TYPE_SET.has(value as AnnouncementType)) {
    throw new Error('公告类型必须是 info | warning | error');
  }
  return value as AnnouncementType;
}

function normalizeText(field: string, value?: string): string {
  const text = value?.trim();
  if (!text) {
    throw new Error(`${field} 不能为空`);
  }
  return text;
}

function sanitizeId(value: string): string {
  return value.trim();
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

async function ensureAnnouncementsFile() {
  await mkdir(dirname(ANNOUNCEMENTS_FILE), { recursive: true });
  try {
    await readFile(ANNOUNCEMENTS_FILE, 'utf8');
  } catch {
    await writeFile(ANNOUNCEMENTS_FILE, `${JSON.stringify(DEFAULT_ANNOUNCEMENTS, null, 2)}\n`, 'utf8');
  }
}

function toAnnouncement(raw: any): Announcement | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = sanitizeId(String(raw.id ?? ''));
  const title = String(raw.title ?? '').trim();
  const content = String(raw.content ?? '').trim();
  const date = String(raw.date ?? '').trim();
  const type = String(raw.type ?? '').trim();
  if (!id || !title || !content || !isValidDate(date) || !TYPE_SET.has(type as AnnouncementType)) {
    return null;
  }
  const defaultCreatedAt = `${date}T00:00:00.000+08:00`;
  const createdAt = normalizeTimestamp(raw.createdAt, defaultCreatedAt);
  const updatedAt = normalizeTimestamp(raw.updatedAt, createdAt);
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

async function readAll(): Promise<Announcement[]> {
  await ensureAnnouncementsFile();
  let content = '[]';
  try {
    content = await readFile(ANNOUNCEMENTS_FILE, 'utf8');
  } catch {
    return sortAnnouncements(DEFAULT_ANNOUNCEMENTS);
  }

  let parsed: any = [];
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = [];
  }

  if (!Array.isArray(parsed)) {
    return sortAnnouncements(DEFAULT_ANNOUNCEMENTS);
  }

  const normalized = parsed
    .map(toAnnouncement)
    .filter((item): item is Announcement => item !== null);

  if (normalized.length === 0) {
    return sortAnnouncements(DEFAULT_ANNOUNCEMENTS);
  }

  return sortAnnouncements(normalized);
}

async function writeAll(items: Announcement[]) {
  await writeFile(ANNOUNCEMENTS_FILE, `${JSON.stringify(sortAnnouncements(items), null, 2)}\n`, 'utf8');
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
