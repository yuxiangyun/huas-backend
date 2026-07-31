/**
 * [INPUT]: 依赖共享 image 转换器、Node 文件系统、Community 资料仓储与注入的媒体配置
 * [OUTPUT]: 对外提供 CommunityAvatarMediaStorage，负责头像压缩、不可变存储、删除与公开读取
 * [POS]: modules/community/infrastructure 的头像文件 adapter，只管理 Community 已发布媒体，不理解校园身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { AppError, ErrorCode } from '../../../utils/errors';
import { transformImageToWebp } from '../../../utils/image';
import type { CommunityAvatarStorage, CommunityProfileRepository } from '../domain/ports';

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

  constructor(
    private readonly profiles: CommunityProfileRepository,
    private readonly options: CommunityAvatarMediaOptions,
  ) {
    this.root = resolve(options.storageRoot);
    this.basePath = normalizedBasePath(options.mediaBasePath);
  }

  async storeAvatar(userId: number, file: File): Promise<string> {
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

    await mkdir(this.root, { recursive: true });
    await writeFile(filePath, transformed.data, { flag: 'wx' });
    return `${this.basePath}/${fileName}`;
  }

  async removeAvatar(avatarUrl: string): Promise<void> {
    const target = this.resolveRequestPath(avatarUrl.split('?')[0] || '');
    if (!target) return;
    await rm(target.filePath, { force: true });
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
