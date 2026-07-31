/**
 * [INPUT]: 依赖共享 image 转换器、构造注入的 Drizzle db、Node 文件系统与 Discover 媒体配置
 * [OUTPUT]: 对外提供 DiscoverMediaService 图片存储/删除/公开读取能力与缓存头常量
 * [POS]: modules/discover/infrastructure 的媒体 adapter，只拥有 Discover 文件路径、可见性和生命周期
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq, isNull } from 'drizzle-orm';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../../../config';
import { schema } from '../../../db';
import { transformImageToWebp } from '../../../utils/image';
import type { DiscoverStoredImage } from '../domain/discover';
import type { DiscoverMediaStorage } from '../domain/ports';
import type { DiscoverDatabase } from './discover-mapping';

interface ResolvedMediaTarget {
  storageKey: string;
  filePath: string;
}

export interface DiscoverMediaOptions {
  storageRoot: string;
  mediaBasePath: string;
  imageMaxBytes: number;
  imageMaxDimension: number;
  imageQuality: number;
}

const DEFAULT_MEDIA_OPTIONS: DiscoverMediaOptions = {
  storageRoot: config.discover.storageRoot,
  mediaBasePath: config.discover.mediaBasePath,
  imageMaxBytes: config.discover.imageMaxBytes,
  imageMaxDimension: config.discover.imageMaxDimension,
  imageQuality: config.discover.imageQuality,
};

export const DISCOVER_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export class DiscoverMediaService implements DiscoverMediaStorage {
  private readonly storageRoot: string;
  private readonly mediaBasePath: string;

  constructor(
    private readonly db: DiscoverDatabase,
    private readonly options: DiscoverMediaOptions = DEFAULT_MEDIA_OPTIONS,
  ) {
    this.storageRoot = resolve(options.storageRoot);
    this.mediaBasePath = options.mediaBasePath.trim().replace(/\/+$/, '');
  }

  async storeImages(files: File[]) {
    await mkdir(this.storageRoot, { recursive: true });

    const storageKey = randomUUID();
    const postDir = resolve(this.storageRoot, storageKey);
    const images: DiscoverStoredImage[] = [];
    await mkdir(postDir, { recursive: true });

    try {
      for (const [index, file] of files.entries()) {
        images.push(await this.compressSingleImage(file, postDir, storageKey, index));
      }
    } catch (error) {
      await rm(postDir, { recursive: true, force: true });
      throw error;
    }

    return {
      storageKey,
      images,
      coverUrl: images[0]?.url || '',
    };
  }

  async removeStorage(storageKey: string) {
    if (!storageKey) return;
    const target = resolve(this.storageRoot, storageKey);
    if (!target.startsWith(`${this.storageRoot}${sep}`)) return;
    await rm(target, { recursive: true, force: true });
  }

  async getPublicFile(requestPath: string): Promise<ReturnType<typeof Bun.file> | null> {
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(requestPath);
    } catch {
      return null;
    }

    const resolved = this.resolveTargetFromRequestPath(decodedPath);
    if (!resolved) return null;
    const rows = await this.db.select({ id: schema.discoverPosts.id })
      .from(schema.discoverPosts)
      .where(and(
        eq(schema.discoverPosts.storageKey, resolved.storageKey),
        isNull(schema.discoverPosts.deletedAt),
      ))
      .limit(1);
    if (rows.length === 0) return null;

    const file = Bun.file(resolved.filePath);
    return await file.exists() ? file : null;
  }

  private async compressSingleImage(
    file: File,
    postDir: string,
    storageKey: string,
    index: number,
  ) {
    const transformed = await transformImageToWebp(file, {
      maxInputBytes: this.options.imageMaxBytes,
      maxDimension: this.options.imageMaxDimension,
      quality: this.options.imageQuality,
      fit: 'inside',
    });
    const outputName = `${String(index + 1).padStart(2, '0')}.webp`;
    await writeFile(join(postDir, outputName), transformed.data);
    return {
      url: `${this.mediaBasePath}/${storageKey}/${outputName}`,
      width: transformed.width,
      height: transformed.height,
      sizeBytes: transformed.sizeBytes,
      mimeType: transformed.mimeType,
    };
  }

  private resolveTargetFromRequestPath(requestPath: string): ResolvedMediaTarget | null {
    const prefix = `${this.mediaBasePath}/`;
    if (!requestPath.startsWith(prefix)) return null;

    const relativePath = requestPath.slice(prefix.length);
    if (!relativePath || relativePath.includes('\0')) return null;
    const [storageKey] = relativePath.split('/');
    if (!storageKey) return null;

    const filePath = resolve(this.storageRoot, relativePath);
    if (!filePath.startsWith(`${this.storageRoot}${sep}`)) return null;
    return { storageKey, filePath };
  }
}
