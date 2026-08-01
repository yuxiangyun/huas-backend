/**
 * [INPUT]: 依赖共享图片转换器、构造注入的 Drizzle db/Treehole 图片策略、Node 文件系统与媒体路径
 * [OUTPUT]: 对外提供 TreeholePostMediaStorage，负责顺序压缩、整批补偿、用户/管理私有读取与按活跃引用回收孤儿目录
 * [POS]: modules/treehole/infrastructure 的独立媒体 adapter，以 UUID 批次和严格 WebP 文件名连接帖子事实，不向 application 泄漏文件系统或 sharp
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { schema } from '../../../db';
import { transformImageToWebp } from '../../../utils/image';
import {
  parseTreeholeStoredImages,
  isTreeholeImageFileName,
  isTreeholeMediaKey,
  validateTreeholeImages,
  type StoredTreeholeMedia,
  type TreeholePolicy,
} from '../domain/treehole';
import type {
  AdminTreeholeMedia,
  TreeholeMediaReader,
  TreeholeMediaStorage,
} from '../domain/ports';
import type { TreeholeDatabase } from './sqlite-treehole-support';

export interface TreeholePostMediaOptions {
  storageRoot: string;
  userMediaBasePath: string;
  adminMediaBasePath: string;
}

export class TreeholePostMediaStorage implements TreeholeMediaStorage, TreeholeMediaReader {
  private readonly root: string;
  private readonly userBasePath: string;
  private readonly adminBasePath: string;

  constructor(
    private readonly db: TreeholeDatabase,
    private readonly policy: TreeholePolicy,
    options: TreeholePostMediaOptions,
  ) {
    this.root = resolve(options.storageRoot);
    this.userBasePath = normalizeBasePath(options.userMediaBasePath);
    this.adminBasePath = normalizeBasePath(options.adminMediaBasePath);
  }

  async prepare(files: readonly File[]): Promise<StoredTreeholeMedia | null> {
    if (files.length === 0) return null;
    validateTreeholeImages(files, this.policy);

    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const mediaKey = randomUUID();
    const batchDirectory = resolve(this.root, mediaKey);
    await mkdir(batchDirectory, { mode: 0o700 });

    const images: StoredTreeholeMedia['images'] = [];
    try {
      for (const [index, file] of files.entries()) {
        const transformed = await transformImageToWebp(file, {
          maxInputBytes: this.policy.maxImageBytes,
          maxInputPixels: this.policy.maxImagePixels,
          maxOutputBytes: this.policy.maxOutputImageBytes,
          maxDimension: this.policy.imageMaxDimension,
          quality: this.policy.imageQuality,
          allowAnimated: this.policy.allowAnimatedImages,
          fit: 'inside',
        });
        const fileName = `${String(index + 1).padStart(2, '0')}.webp`;
        await writeFile(join(batchDirectory, fileName), transformed.data, {
          flag: 'wx',
          mode: 0o600,
        });
        images.push({
          fileName,
          width: transformed.width,
          height: transformed.height,
          sizeBytes: transformed.sizeBytes,
          mimeType: transformed.mimeType,
        });
      }
      return { mediaKey, images };
    } catch (error) {
      try {
        await rm(batchDirectory, { recursive: true, force: true });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Treehole 图片批次处理与补偿均失败 mediaKey=${mediaKey}`,
        );
      }
      throw error;
    }
  }

  async removeStorage(mediaKey: string | null): Promise<void> {
    const directory = this.resolveMediaDirectory(mediaKey);
    if (!directory) return;
    await rm(directory, { recursive: true, force: true });
  }

  userUrlFor(mediaKey: string, fileName: string) {
    return `${this.userBasePath}/${mediaKey}/${fileName}`;
  }

  adminUrlFor(mediaKey: string, fileName: string) {
    return `${this.adminBasePath}/${mediaKey}/${fileName}`;
  }

  async getForUser(mediaKey: string, fileName: string): Promise<Blob | null> {
    const resolved = await this.resolveActiveFile(mediaKey, fileName);
    return resolved?.data ?? null;
  }

  async getForAdmin(mediaKey: string, fileName: string): Promise<AdminTreeholeMedia | null> {
    return this.resolveActiveFile(mediaKey, fileName);
  }

  async cleanupOrphans(before: Date): Promise<number> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const referencedRows = await this.db.select({ mediaKey: schema.treeholePosts.mediaKey })
      .from(schema.treeholePosts)
      .where(and(
        isNull(schema.treeholePosts.deletedAt),
        isNotNull(schema.treeholePosts.mediaKey),
      ));
    const referenced = new Set(referencedRows.flatMap((row) => (
      row.mediaKey && isTreeholeMediaKey(row.mediaKey)
        ? [row.mediaKey.toLowerCase()]
        : []
    )));
    const entries = await readdir(this.root, { withFileTypes: true });
    const failures: unknown[] = [];
    let removed = 0;

    for (const entry of entries) {
      if (!entry.isDirectory() || !isTreeholeMediaKey(entry.name)) continue;
      if (referenced.has(entry.name.toLowerCase())) continue;

      const directory = resolve(this.root, entry.name);
      try {
        const metadata = await stat(directory);
        if (metadata.mtime.getTime() > before.getTime()) continue;
        await rm(directory, { recursive: true, force: true });
        removed += 1;
      } catch (error: any) {
        if (error?.code !== 'ENOENT') failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, `Treehole 孤儿媒体清理失败 count=${failures.length}`);
    }
    return removed;
  }

  private resolveMediaDirectory(mediaKey: string | null) {
    if (!mediaKey || !isTreeholeMediaKey(mediaKey)) return null;
    const directory = resolve(this.root, mediaKey);
    return directory.startsWith(`${this.root}${sep}`) ? directory : null;
  }

  private async resolveActiveFile(mediaKey: string, fileName: string) {
    const directory = this.resolveMediaDirectory(mediaKey);
    if (!directory || !isTreeholeImageFileName(fileName)) return null;

    const rows = await this.db.select({
      postId: schema.treeholePosts.id,
      imagesJson: schema.treeholePosts.imagesJson,
    })
      .from(schema.treeholePosts)
      .where(and(
        eq(schema.treeholePosts.mediaKey, mediaKey),
        isNull(schema.treeholePosts.deletedAt),
      ))
      .limit(1);
    const row = rows[0];
    const storedImage = row
      ? parseTreeholeStoredImages(row.imagesJson).find((image) => image.fileName === fileName)
      : null;
    if (!row || !storedImage) return null;

    const filePath = resolve(directory, fileName);
    if (!filePath.startsWith(`${directory}${sep}`)) return null;
    try {
      const metadata = await lstat(filePath);
      if (!metadata.isFile() || metadata.size !== storedImage.sizeBytes) return null;
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
    const data = Bun.file(filePath);
    return await data.exists() ? { data, postId: row.postId } : null;
  }
}

function normalizeBasePath(value: string) {
  const normalized = value.trim().replace(/\/+$/u, '');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
