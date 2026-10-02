/**
 * [INPUT]: 依赖共享 image 转换器、Node 文件系统、Community 资料仓储与注入的媒体配置
 * [OUTPUT]: 对外提供 CommunityAvatarMediaStorage，负责头像压缩、受保护不可变候选、删除、公开读取与引用/宽限期孤儿回收
 * [POS]: modules/community/infrastructure 的头像文件 adapter，从创建前登记候选至用例收尾，并在回收前核对当前引用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { AppError, ErrorCode } from '../../../utils/errors';
import { transformImageToWebp } from '../../../utils/image';
import type {
  CommunityAvatarCandidate,
  CommunityAvatarStorage,
  CommunityProfileRepository,
} from '../domain/ports';

export const COMMUNITY_AVATAR_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface CommunityAvatarMediaOptions {
  storageRoot: string;
  mediaBasePath: string;
  maxBytes: number;
  maxDimension: number;
  quality: number;
}

function normalizedBasePath(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export class CommunityAvatarMediaStorage implements CommunityAvatarStorage {
  private readonly root: string;
  private readonly basePath: string;
  private readonly activeCandidates = new Set<string>();

  constructor(
    private readonly profiles: CommunityProfileRepository,
    private readonly options: CommunityAvatarMediaOptions,
  ) {
    this.root = resolve(options.storageRoot);
    this.basePath = normalizedBasePath(options.mediaBasePath);
  }

  async storeAvatar(userId: number, file: File): Promise<CommunityAvatarCandidate> {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '用户 ID 不合法');
    }

    const transformed = await transformImageToWebp(file, {
      maxInputBytes: this.options.maxBytes,
      maxDimension: this.options.maxDimension,
      quality: this.options.quality,
      fit: 'cover',
    });
    const fileName = `${userId}-${randomUUID()}.webp`;
    const filePath = this.resolveFileName(fileName);
    if (!filePath) throw new AppError(ErrorCode.PARAM_ERROR, '头像存储路径不合法');

    // 先登记再创建，保护仍在写入及已写完但尚未发布的文件，不依赖宽限期足够长。
    this.activeCandidates.add(filePath);
    let stored = false;
    try {
      await mkdir(this.root, { recursive: true });
      await writeFile(filePath, transformed.data, { flag: 'wx' });
      stored = true;
      return {
        avatarUrl: `${this.basePath}/${fileName}`,
        release: () => { this.activeCandidates.delete(filePath); },
      };
    } finally {
      // 创建失败不可能再发布；若有部分文件，解除保护后由宽限期回收兜底。
      if (!stored) this.activeCandidates.delete(filePath);
    }
  }

  async removeAvatar(avatarUrl: string): Promise<void> {
    const target = this.resolveRequestPath(avatarUrl.split('?')[0] || '');
    if (!target) return;
    await rm(target.filePath, { force: true });
  }

  async cleanupOrphans(before: Date): Promise<number> {
    await mkdir(this.root, { recursive: true });
    const publishedUrls = await this.profiles.listPublishedAvatarUrls();
    const referenced = new Set(publishedUrls.flatMap((avatarUrl) => {
      const target = this.resolveRequestPath(avatarUrl.split('?')[0] || '');
      return target ? [target.filePath] : [];
    }));
    const entries = await readdir(this.root, { withFileTypes: true });
    const failures: unknown[] = [];
    let removed = 0;

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = this.resolveFileName(entry.name);
      if (!filePath || referenced.has(filePath) || this.activeCandidates.has(filePath)) continue;
      try {
        const metadata = await stat(filePath);
        if (metadata.mtime > before || this.activeCandidates.has(filePath)) continue;
        // 此时候选必须已收尾；不可变 URL 不复用，后续不会再首次发布这个路径。
        if (await this.profiles.isAvatarPublished(`${this.basePath}/${entry.name}`)) continue;
        if (this.activeCandidates.has(filePath)) continue;
        await rm(filePath);
        removed += 1;
      } catch (error: unknown) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          failures.push(error);
        }
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, `Community 孤儿头像清理失败 count=${failures.length}`);
    }
    return removed;
  }

  async getPublicFile(requestPath: string): Promise<ReturnType<typeof Bun.file> | null> {
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(requestPath);
    } catch {
      return null;
    }

    const target = this.resolveRequestPath(decodedPath.split('?')[0] || '');
    if (!target || !(await this.profiles.isAvatarPublished(target.publicPath))) return null;

    const file = Bun.file(target.filePath);
    return await file.exists() ? file : null;
  }

  private resolveRequestPath(requestPath: string) {
    const prefix = `${this.basePath}/`;
    if (!requestPath.startsWith(prefix)) return null;

    const fileName = requestPath.slice(prefix.length);
    const filePath = this.resolveFileName(fileName);
    if (!filePath) return null;
    return {
      filePath,
      publicPath: `${this.basePath}/${fileName}`,
    };
  }

  private resolveFileName(fileName: string) {
    // 同时读取 0003 从 users 迁来的旧 {id}.webp，与新不可变 {id}-{uuid}.webp。
    if (!/^\d+(?:-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?\.webp$/i.test(fileName)) {
      return null;
    }
    const filePath = resolve(this.root, fileName);
    return filePath.startsWith(`${this.root}${sep}`) ? filePath : null;
  }
}
