/**
 * [INPUT]: 依赖运行配置、共享 WebP 转换器与 Node 原子文件操作
 * [OUTPUT]: 对外提供三态底栏首页弹窗 DTO、IndexPopupService 单配置读写/内容版本/投放过滤/公开媒体读取能力及媒体策略常量
 * [POS]: operations/infrastructure 的首页弹窗文件 adapter，以不可变内容版本图片配合 fsync 原子配置替换，配置损坏时沿用最后有效快照降级，保持投放判断、底栏动作与媒体发布状态同源
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { config } from '../../../config';
import { AppError, ErrorCode } from '../../../utils/errors';
import { transformImageToWebp } from '../../../utils/image';
import { Logger } from '../../../utils/logger';

export type IndexPopupFrequency = 'once' | 'daily' | 'startup';
export type IndexPopupActionType = 'public_account' | 'text' | 'none';

export interface PublicIndexPopup {
  version: string;
  imageUrl: string;
  actionType: IndexPopupActionType;
  actionText: string;
  frequency: IndexPopupFrequency;
}

export interface AdminIndexPopupSettings {
  enabled: boolean;
  version: string | null;
  imageUrl: string | null;
  actionType: IndexPopupActionType;
  actionText: string;
  frequency: IndexPopupFrequency;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string | null;
}

export interface UpdateIndexPopupInput {
  enabled: unknown;
  frequency: unknown;
  actionType?: unknown;
  actionText?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  image?: File;
}

export const INDEX_POPUP_MEDIA_BASE_PATH = '/media/index-popup';
export const INDEX_POPUP_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const INDEX_POPUP_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_INDEX_POPUP_ACTION_TEXT = '了解更多';
export const INDEX_POPUP_RETAINED_MEDIA_VERSIONS = 3;

const INDEX_POPUP_IMAGE_MAX_PIXELS = 24_000_000;
const INDEX_POPUP_IMAGE_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const INDEX_POPUP_IMAGE_MAX_DIMENSION = 2_560;
const INDEX_POPUP_IMAGE_QUALITY = 82;
const FREQUENCIES = new Set<IndexPopupFrequency>(['once', 'daily', 'startup']);
const ACTION_TYPES = new Set<IndexPopupActionType>(['public_account', 'text', 'none']);
const STORAGE_ROOT = resolve(dirname(config.dbPath), 'index-popup');
const SETTINGS_FILE = join(STORAGE_ROOT, 'settings.json');
const MEDIA_ROOT = join(STORAGE_ROOT, 'media');
const VERSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_SETTINGS: AdminIndexPopupSettings = {
  enabled: false,
  version: null,
  imageUrl: null,
  actionType: 'public_account',
  actionText: DEFAULT_INDEX_POPUP_ACTION_TEXT,
  frequency: 'daily',
  startsAt: null,
  endsAt: null,
  updatedAt: null,
};

let writeQueue = Promise.resolve();
let lastGoodSettings: AdminIndexPopupSettings | null = null;
let settingsFailureLogged = false;

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new AppError(ErrorCode.PARAM_ERROR, 'enabled 必须是 true 或 false');
}

function normalizeFrequency(value: unknown): IndexPopupFrequency {
  const frequency = typeof value === 'string' ? value.trim() : '';
  if (!FREQUENCIES.has(frequency as IndexPopupFrequency)) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'frequency 必须是 once、daily 或 startup');
  }
  return frequency as IndexPopupFrequency;
}

function normalizeActionText(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.PARAM_ERROR, 'actionText 必须是字符串');
  }
  const actionText = value.trim();
  if (!actionText) throw new AppError(ErrorCode.PARAM_ERROR, 'actionText 不能为空');
  if (Array.from(actionText).length > 20 || /[\u0000-\u001f\u007f]/.test(actionText)) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'actionText 最多 20 个字符且不能包含控制字符');
  }
  return actionText;
}

function normalizeActionType(value: unknown): IndexPopupActionType {
  const actionType = typeof value === 'string' ? value.trim() : '';
  if (!ACTION_TYPES.has(actionType as IndexPopupActionType)) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'actionType 必须是 public_account、text 或 none');
  }
  return actionType as IndexPopupActionType;
}

function normalizeDateTime(field: string, value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AppError(ErrorCode.PARAM_ERROR, `${field} 必须是日期时间字符串`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(trimmed)
    ? `${trimmed}+08:00`
    : trimmed;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) throw new AppError(ErrorCode.PARAM_ERROR, `${field} 不是有效的日期时间`);
  return parsed.toISOString();
}

function assertTimeWindow(startsAt: string | null, endsAt: string | null): void {
  if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'endsAt 必须晚于 startsAt');
  }
}

function parseSettings(content: string): AdminIndexPopupSettings {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error('首页弹窗配置文件不是有效的 JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('首页弹窗配置文件必须是对象');
  try {
    const record = value as Record<string, unknown>;
    const enabled = normalizeBoolean(record.enabled);
    const frequency = normalizeFrequency(record.frequency);
    const actionType = record.actionType === undefined
      ? 'public_account'
      : normalizeActionType(record.actionType);
    const version = record.version === null ? null : typeof record.version === 'string' ? record.version : '';
    const imageUrl = record.imageUrl === null ? null : typeof record.imageUrl === 'string' ? record.imageUrl : '';
    const actionText = record.actionText === undefined
      ? DEFAULT_INDEX_POPUP_ACTION_TEXT
      : normalizeActionText(record.actionText);
    const startsAt = normalizeDateTime('startsAt', record.startsAt);
    const endsAt = normalizeDateTime('endsAt', record.endsAt);
    const updatedAt = normalizeDateTime('updatedAt', record.updatedAt);
    if ((version === null) !== (imageUrl === null) || (version && !VERSION_PATTERN.test(version))) {
      throw new Error('首页弹窗配置文件包含非法图片版本');
    }
    if (version && imageUrl !== `${INDEX_POPUP_MEDIA_BASE_PATH}/${version}.webp`) {
      throw new Error('首页弹窗配置文件包含非法图片地址');
    }
    if (enabled && !version) throw new Error('已启用的首页弹窗缺少图片');
    assertTimeWindow(startsAt, endsAt);
    return {
      enabled,
      version,
      imageUrl,
      actionType,
      actionText,
      frequency,
      startsAt,
      endsAt,
      updatedAt,
    };
  } catch (error) {
    if (error instanceof AppError) throw new Error(`首页弹窗配置文件包含非法字段: ${error.message}`);
    throw error;
  }
}

async function readSettings(): Promise<AdminIndexPopupSettings> {
  try {
    const parsed = parseSettings(await readFile(SETTINGS_FILE, 'utf8'));
    lastGoodSettings = parsed;
    settingsFailureLogged = false;
    return parsed;
  } catch (error) {
    if (isFileNotFound(error)) return { ...DEFAULT_SETTINGS };
    // 配置损坏不得打挂匿名投影：沿用最后有效快照（无快照时按未投放降级），成功前只告警一次。
    if (!settingsFailureLogged) {
      Logger.warn(
        'IndexPopup',
        '首页弹窗配置读取失败，沿用最后有效快照',
        error instanceof Error ? error.message : String(error),
      );
      settingsFailureLogged = true;
    }
    return lastGoodSettings ? { ...lastGoodSettings } : { ...DEFAULT_SETTINGS };
  }
}

async function atomicWrite(target: string, content: string | Uint8Array): Promise<void> {
  const directory = dirname(target);
  const tempFile = join(directory, `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(tempFile, 'wx');
    await handle.writeFile(content);
    // fsync 防止崩溃后 rename 落盘成空文件，与课表来源策略存储的持久化纪律对齐。
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(tempFile, target);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(tempFile).catch(() => undefined);
    throw error;
  }
}

function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
}

function mediaPathFor(version: string): string {
  return join(MEDIA_ROOT, `${version}.webp`);
}

async function pruneStaleMediaFiles(activeVersion: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(MEDIA_ROOT, { withFileTypes: true });
  } catch (error) {
    if (isFileNotFound(error)) return;
    throw error;
  }

  const mediaFiles = await Promise.all(entries
    .filter((entry) => entry.isFile() && /^([0-9a-f-]+)\.webp$/i.test(entry.name))
    .map(async (entry) => {
      const version = entry.name.slice(0, -'.webp'.length);
      if (!VERSION_PATTERN.test(version)) return null;
      const filePath = mediaPathFor(version);
      return { version, filePath, modifiedAt: (await stat(filePath)).mtimeMs };
    }));
  const ordered = mediaFiles
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  const retained = new Set([
    activeVersion,
    ...ordered
      .filter((item) => item.version !== activeVersion)
      .slice(0, INDEX_POPUP_RETAINED_MEDIA_VERSIONS - 1)
      .map((item) => item.version),
  ]);

  await Promise.all(ordered
    .filter((item) => !retained.has(item.version))
    .map((item) => rm(item.filePath, { force: true })));
}

export class IndexPopupService {
  static async getAdmin(): Promise<AdminIndexPopupSettings> {
    return readSettings();
  }

  static async getPublic(now: Date = new Date()): Promise<PublicIndexPopup | null> {
    const settings = await readSettings();
    const timestamp = now.getTime();
    if (!settings.enabled || !settings.version || !settings.imageUrl) return null;
    if (settings.startsAt && timestamp < Date.parse(settings.startsAt)) return null;
    if (settings.endsAt && timestamp >= Date.parse(settings.endsAt)) return null;
    return {
      version: settings.version,
      imageUrl: settings.imageUrl,
      actionType: settings.actionType,
      actionText: settings.actionText,
      frequency: settings.frequency,
    };
  }

  static async update(input: UpdateIndexPopupInput): Promise<AdminIndexPopupSettings> {
    return withWriteLock(async () => {
      const enabled = normalizeBoolean(input.enabled);
      const frequency = normalizeFrequency(input.frequency);
      const startsAt = normalizeDateTime('startsAt', input.startsAt);
      const endsAt = normalizeDateTime('endsAt', input.endsAt);
      assertTimeWindow(startsAt, endsAt);

      const current = await readSettings();
      const actionType = input.actionType === undefined || input.actionType === null
        ? current.actionType
        : normalizeActionType(input.actionType);
      const rawActionText = input.actionText === undefined || input.actionText === null
        ? current.actionText
        : typeof input.actionText === 'string' ? input.actionText.trim() : input.actionText;
      const actionText = actionType === 'none' && rawActionText === ''
        ? current.actionText
        : normalizeActionText(rawActionText);
      const actionContentChanged = actionType !== current.actionType || actionText !== current.actionText;
      let version = current.version;
      let imageUrl = current.imageUrl;
      let newImagePath: string | null = null;

      if (input.image !== undefined) {
        const transformed = await transformImageToWebp(input.image, {
          maxInputBytes: INDEX_POPUP_IMAGE_MAX_BYTES,
          maxDimension: INDEX_POPUP_IMAGE_MAX_DIMENSION,
          maxInputPixels: INDEX_POPUP_IMAGE_MAX_PIXELS,
          maxPages: 1,
          allowAnimated: false,
          maxOutputBytes: INDEX_POPUP_IMAGE_MAX_OUTPUT_BYTES,
          quality: INDEX_POPUP_IMAGE_QUALITY,
          fit: 'inside',
        });
        version = randomUUID();
        imageUrl = `${INDEX_POPUP_MEDIA_BASE_PATH}/${version}.webp`;
        newImagePath = mediaPathFor(version);
        await atomicWrite(newImagePath, transformed.data);
      } else if (current.version && actionContentChanged) {
        version = randomUUID();
        imageUrl = `${INDEX_POPUP_MEDIA_BASE_PATH}/${version}.webp`;
        newImagePath = mediaPathFor(version);
        await atomicWrite(newImagePath, await readFile(mediaPathFor(current.version)));
      }

      if (enabled && (!version || !imageUrl)) {
        if (newImagePath) await rm(newImagePath, { force: true });
        throw new AppError(ErrorCode.PARAM_ERROR, '启用首页弹窗前必须上传图片');
      }

      const next: AdminIndexPopupSettings = {
        enabled,
        version,
        imageUrl,
        actionType,
        actionText,
        frequency,
        startsAt,
        endsAt,
        updatedAt: new Date().toISOString(),
      };
      try {
        await atomicWrite(SETTINGS_FILE, `${JSON.stringify(next, null, 2)}\n`);
      } catch (error) {
        if (newImagePath) {
          await rm(newImagePath, { force: true }).catch((cleanupError) => {
            Logger.warn('IndexPopup', '候选海报清理失败', String(cleanupError));
          });
        }
        throw error;
      }

      if (newImagePath && version) {
        await pruneStaleMediaFiles(version).catch((cleanupError) => {
          Logger.warn('IndexPopup', '历史海报清理失败', String(cleanupError));
        });
      }
      return next;
    });
  }

  static async getPublicFile(requestPath: string): Promise<ReturnType<typeof Bun.file> | null> {
    let decoded: string;
    try {
      decoded = decodeURIComponent(requestPath.split('?')[0] || '');
    } catch {
      return null;
    }
    const prefix = `${INDEX_POPUP_MEDIA_BASE_PATH}/`;
    if (!decoded.startsWith(prefix)) return null;
    const fileName = decoded.slice(prefix.length);
    const match = fileName.match(/^([0-9a-f-]+)\.webp$/i);
    if (!match || !VERSION_PATTERN.test(match[1])) return null;
    const filePath = resolve(MEDIA_ROOT, fileName);
    if (!filePath.startsWith(`${resolve(MEDIA_ROOT)}${sep}`)) return null;
    const file = Bun.file(filePath);
    return await file.exists() ? file : null;
  }
}
