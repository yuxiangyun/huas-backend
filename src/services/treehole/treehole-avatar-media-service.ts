import sharp, { type Metadata } from 'sharp';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { eq } from 'drizzle-orm';
import { config } from '../../config';
import { getDb, schema } from '../../db';
import { AppError, ErrorCode } from '../../utils/errors';
import { Logger } from '../../utils/logger';

const SUPPORTED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'tiff', 'avif']);
const SUPPORTED_FORMAT_MESSAGE = '头像仅支持 JPG、PNG、WebP、GIF、HEIC、HEIF、AVIF、TIFF 等图片格式';
const AVATAR_MAX_SIDE = 256;
const AVATAR_QUALITY = 80;

export const TREEHOLE_AVATAR_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export class TreeholeAvatarMediaService {
  static async uploadAvatar(userId: number, file: File) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '用户 ID 不合法');
    }
    if (!(file instanceof File) || file.size <= 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '头像文件不能为空');
    }
    if (file.size > config.treehole.avatarMaxBytes) {
      throw new AppError(
        ErrorCode.PARAM_ERROR,
        `头像大小不能超过 ${Math.floor(config.treehole.avatarMaxBytes / 1024 / 1024)}MB`
      );
    }

    await mkdir(config.treehole.avatarStorageRoot, { recursive: true });
    const source = Buffer.from(await file.arrayBuffer());
    await this.readSourceMetadata(source);

    const fileName = this.fileNameFromUserId(userId);
    const outputPath = resolve(config.treehole.avatarStorageRoot, fileName);
    const outputRoot = resolve(config.treehole.avatarStorageRoot);
    if (outputPath !== outputRoot && !outputPath.startsWith(outputRoot + sep)) {
      throw new AppError(ErrorCode.PARAM_ERROR, '头像存储路径不合法');
    }

    try {
      const transformed = await sharp(source)
        .rotate()
        .resize({
          width: AVATAR_MAX_SIDE,
          height: AVATAR_MAX_SIDE,
          fit: 'cover',
          position: 'centre',
        })
        .webp({ quality: AVATAR_QUALITY })
        .toBuffer();

      await writeFile(outputPath, transformed);
      return `${config.treehole.avatarMediaBasePath}/${fileName}?v=${Date.now()}`;
    } catch (err: any) {
      Logger.error('TreeholeAvatarMedia', '头像处理失败', err);
      throw new AppError(ErrorCode.PARAM_ERROR, '头像处理失败，请更换图片后重试');
    }
  }

  static async removeAvatar(userId: number) {
    if (!Number.isInteger(userId) || userId <= 0) return;
    await rm(resolve(config.treehole.avatarStorageRoot, this.fileNameFromUserId(userId)), {
      recursive: false,
      force: true,
    });
  }

  static async getPublicFile(requestPath: string): Promise<ReturnType<typeof Bun.file> | null> {
    let decodedPath = requestPath;
    try {
      decodedPath = decodeURIComponent(requestPath);
    } catch {
      return null;
    }

    const fileName = this.resolveFileNameFromRequestPath(decodedPath);
    if (!fileName) return null;

    const userId = Number(fileName.replace(/\.webp$/, ''));
    if (!Number.isInteger(userId) || userId <= 0) return null;

    const db = getDb();
    const rows = await db.select({ avatarUrl: schema.users.treeholeAvatarUrl })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const avatarUrl = rows[0]?.avatarUrl;
    if (!avatarUrl) return null;
    if (this.normalizePublicPath(avatarUrl) !== `${config.treehole.avatarMediaBasePath}/${fileName}`) {
      return null;
    }

    const filePath = resolve(config.treehole.avatarStorageRoot, fileName);
    const root = resolve(config.treehole.avatarStorageRoot);
    if (filePath !== root && !filePath.startsWith(root + sep)) return null;

    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;
    return file;
  }

  private static fileNameFromUserId(userId: number) {
    return `${userId}.webp`;
  }

  private static resolveFileNameFromRequestPath(requestPath: string) {
    const prefix = `${config.treehole.avatarMediaBasePath}/`;
    if (!requestPath.startsWith(prefix)) return null;

    const relativePath = requestPath.slice(prefix.length);
    if (!/^\d+\.webp$/.test(relativePath)) return null;
    return relativePath;
  }

  private static normalizePublicPath(url: string) {
    return url.split('?')[0] || '';
  }

  private static async readSourceMetadata(source: Buffer): Promise<Metadata> {
    try {
      const metadata = await sharp(source).metadata();
      if (!metadata.format || !SUPPORTED_INPUT_FORMATS.has(metadata.format)) {
        throw new AppError(ErrorCode.PARAM_ERROR, SUPPORTED_FORMAT_MESSAGE);
      }
      return metadata;
    } catch (err) {
      if (err instanceof AppError) throw err;
      Logger.error('TreeholeAvatarMedia', '不支持的头像格式', err);
      throw new AppError(ErrorCode.PARAM_ERROR, SUPPORTED_FORMAT_MESSAGE);
    }
  }
}
