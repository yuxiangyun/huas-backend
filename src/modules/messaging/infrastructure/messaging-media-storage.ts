/**
 * [INPUT]: 依赖共享 image 转换器、构造注入的 Drizzle db、Node 文件系统与 Messaging 媒体策略
 * [OUTPUT]: 对外提供 MessagingMediaStorage，负责候选图片、幂等比对、补偿、参与者读取及带 conversationId 的管理读取
 * [POS]: modules/messaging/infrastructure 的私有媒体 adapter，以稳定存储键连接管理审计上下文且不挂公开静态路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { and, eq, or } from 'drizzle-orm';
import { schema } from '../../../db';
import { transformImageToWebp } from '../../../utils/image';
import {
  validateMessageImages,
  type MessageImageFact,
  type MessagingPolicy,
  type PreparedMessageMedia,
} from '../domain/messaging';
import type { MessageMediaStorage } from '../domain/ports';
import type { MessagingDatabase } from './sqlite-messaging-repository';

export interface MessagingMediaOptions {
  storageRoot: string;
  mediaBasePath: string;
  adminMediaBasePath: string;
}

const BATCH_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STORAGE_KEY_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(0[1-9])\.webp$/iu;

export class MessagingMediaStorage implements MessageMediaStorage {
  private readonly root: string;
  private readonly basePath: string;
  private readonly adminBasePath: string;

  constructor(
    private readonly db: MessagingDatabase,
    private readonly policy: MessagingPolicy,
    options: MessagingMediaOptions,
  ) {
    this.root = resolve(options.storageRoot);
    this.basePath = normalizeBasePath(options.mediaBasePath);
    this.adminBasePath = normalizeBasePath(options.adminMediaBasePath);
  }

  async prepare(files: readonly File[]): Promise<PreparedMessageMedia | null> {
    if (files.length === 0) return null;
    validateMessageImages(files, this.policy);
    const batchKey = randomUUID();
    const batchDirectory = resolve(this.root, batchKey);
    await mkdir(batchDirectory, { recursive: true });
    const images: PreparedMessageMedia['images'] = [];
    try {
      for (const [index, file] of files.entries()) {
        const transformed = await transformImageToWebp(file, {
          maxInputBytes: this.policy.maxImageBytes,
          maxDimension: this.policy.imageMaxDimension,
          quality: this.policy.imageQuality,
          fit: 'inside',
        });
        const fileName = `${String(index + 1).padStart(2, '0')}.webp`;
        await writeFile(join(batchDirectory, fileName), transformed.data, { flag: 'wx' });
        images.push({
          storageKey: `${batchKey}/${fileName}`,
          sortOrder: index,
          width: transformed.width,
          height: transformed.height,
          sizeBytes: transformed.sizeBytes,
          mimeType: transformed.mimeType,
        });
      }
      return { batchKey, images };
    } catch (error) {
      try {
        await rm(batchDirectory, { recursive: true, force: true });
      } catch {
        // 保留原始转码/写盘错误，遗留目录交给周期无主清理。
      }
      throw error;
    }
  }

  async isEquivalent(
    prepared: PreparedMessageMedia | null,
    existing: readonly MessageImageFact[],
  ) {
    const candidates = prepared?.images ?? [];
    const persisted = [...existing].sort((left, right) => left.sortOrder - right.sortOrder);
    if (candidates.length !== persisted.length) return false;

    for (const [index, candidate] of candidates.entries()) {
      const current = persisted[index]!;
      if (candidate.sortOrder !== current.sortOrder
        || candidate.width !== current.width
        || candidate.height !== current.height
        || candidate.sizeBytes !== current.sizeBytes
        || candidate.mimeType !== current.mimeType) {
        return false;
      }
      const candidatePath = this.resolveStorageKey(candidate.storageKey);
      const currentPath = this.resolveStorageKey(current.storageKey);
      if (!candidatePath || !currentPath) return false;
      const candidateFile = Bun.file(candidatePath);
      const currentFile = Bun.file(currentPath);
      if (!await candidateFile.exists() || !await currentFile.exists()) return false;
      const [candidateBytes, currentBytes] = await Promise.all([
        candidateFile.arrayBuffer(),
        currentFile.arrayBuffer(),
      ]);
      if (!Buffer.from(candidateBytes).equals(Buffer.from(currentBytes))) return false;
    }
    return true;
  }

  async discard(media: PreparedMessageMedia | null) {
    if (!media || !BATCH_KEY_PATTERN.test(media.batchKey)) return;
    await rm(resolve(this.root, media.batchKey), { recursive: true, force: true });
  }

  urlFor(storageKey: string) {
    return `${this.basePath}/${storageKey}`;
  }

  adminUrlFor(storageKey: string) {
    return `${this.adminBasePath}/${storageKey}`;
  }

  async getForParticipant(userId: number, storageKey: string) {
    const filePath = this.resolveStorageKey(storageKey);
    if (!filePath) return null;
    const rows = await this.db.select({ id: schema.messageImages.id })
      .from(schema.messageImages)
      .innerJoin(schema.messages, eq(schema.messageImages.messageId, schema.messages.id))
      .innerJoin(
        schema.conversations,
        eq(schema.messages.conversationId, schema.conversations.id),
      )
      .where(and(
        eq(schema.messageImages.storageKey, storageKey),
        or(
          eq(schema.conversations.userLowId, userId),
          eq(schema.conversations.userHighId, userId),
        ),
      ))
      .limit(1);
    return rows.length === 0 ? null : this.openExistingFile(filePath);
  }

  async getForAdmin(storageKey: string) {
    const filePath = this.resolveStorageKey(storageKey);
    if (!filePath) return null;
    const rows = await this.db.select({
      id: schema.messageImages.id,
      conversationId: schema.messages.conversationId,
    })
      .from(schema.messageImages)
      .innerJoin(schema.messages, eq(schema.messageImages.messageId, schema.messages.id))
      .where(eq(schema.messageImages.storageKey, storageKey))
      .limit(1);
    if (!rows[0]) return null;
    const data = await this.openExistingFile(filePath);
    return data ? { data, conversationId: rows[0].conversationId } : null;
  }

  async cleanupOrphans(before: Date) {
    await mkdir(this.root, { recursive: true });
    const [entries, referencedRows] = await Promise.all([
      readdir(this.root, { withFileTypes: true }),
      this.db.select({ storageKey: schema.messageImages.storageKey }).from(schema.messageImages),
    ]);
    const referencedBatches = new Set(referencedRows.flatMap((row) => {
      const match = STORAGE_KEY_PATTERN.exec(row.storageKey);
      return match?.[1] ? [match[1].toLowerCase()] : [];
    }));

    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !BATCH_KEY_PATTERN.test(entry.name)) continue;
      if (referencedBatches.has(entry.name.toLowerCase())) continue;
      const directoryPath = resolve(this.root, entry.name);
      const info = await stat(directoryPath);
      if (info.mtime.getTime() > before.getTime()) continue;
      await rm(directoryPath, { recursive: true, force: true });
      removed += 1;
    }
    return removed;
  }

  private resolveStorageKey(storageKey: string) {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) return null;
    const filePath = resolve(this.root, storageKey);
    return filePath.startsWith(`${this.root}${sep}`) ? filePath : null;
  }

  private async openExistingFile(filePath: string) {
    const file = Bun.file(filePath);
    return await file.exists() ? file : null;
  }
}

function normalizeBasePath(value: string) {
  const normalized = value.trim().replace(/\/+$/, '');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
