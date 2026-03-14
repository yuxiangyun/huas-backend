import { and, eq, isNull } from 'drizzle-orm';
import heicConvert from 'heic-convert';
import sharp, { type Metadata } from 'sharp';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../../config';
import { getDb, schema } from '../../db';
import { AppError, ErrorCode } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import type { DiscoverStoredImage } from '../../utils/discover';

interface ResolvedMediaTarget {
  storageKey: string;
  filePath: string;
}

const SUPPORTED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'avif', 'tiff']);
const SUPPORTED_FORMAT_MESSAGE = '支持 JPG、PNG、WebP、GIF、HEIC、HEIF、AVIF、TIFF 等主流手机图片格式，动图会保留动画';
const HEIF_FILE_EXT_RE = /\.(?:heic|heif|heics|heifs|hif)$/i;
const HEIF_MIME_RE = /^image\/(?:heic|heif|heic-sequence|heif-sequence)$/i;
const HEIF_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx',
  'heim', 'heis', 'hevm', 'hevs',
  'mif1', 'msf1',
]);
export const DISCOVER_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export class DiscoverMediaService {
  static async compressAndStoreImages(files: File[]) {
    await mkdir(config.discover.storageRoot, { recursive: true });

    const storageKey = randomUUID();
    const postDir = resolve(config.discover.storageRoot, storageKey);
    const images: DiscoverStoredImage[] = [];

    await mkdir(postDir, { recursive: true });

    try {
      for (const [index, file] of files.entries()) {
        images.push(await this.compressSingleImage(file, postDir, storageKey, index));
      }
    } catch (err) {
      await rm(postDir, { recursive: true, force: true });
      throw err;
    }

    return {
      storageKey,
      images,
      coverUrl: images[0]?.url || '',
    };
  }

  static async removeStorage(storageKey: string) {
    if (!storageKey) return;
    const target = resolve(config.discover.storageRoot, storageKey);
    if (!target.startsWith(resolve(config.discover.storageRoot) + sep)) return;
    await rm(target, { recursive: true, force: true });
  }

  static async getPublicFile(requestPath: string): Promise<ReturnType<typeof Bun.file> | null> {
    let decodedPath = requestPath;
    try {
      decodedPath = decodeURIComponent(requestPath);
    } catch {
      return null;
    }

    const resolved = this.resolveTargetFromRequestPath(decodedPath);
    if (!resolved) return null;

    const db = getDb();
    const rows = await db.select({ id: schema.discoverPosts.id })
      .from(schema.discoverPosts)
      .where(and(
        eq(schema.discoverPosts.storageKey, resolved.storageKey),
        isNull(schema.discoverPosts.deletedAt),
      ))
      .limit(1);

    if (rows.length === 0) return null;

    const file = Bun.file(resolved.filePath);
    if (!(await file.exists())) return null;
    return file;
  }

  private static resolveTargetFromRequestPath(requestPath: string): ResolvedMediaTarget | null {
    const prefix = `${config.discover.mediaBasePath}/`;
    if (!requestPath.startsWith(prefix)) return null;

    const relativePath = requestPath.slice(prefix.length);
    if (!relativePath || relativePath.includes('\0')) return null;
    const [storageKey] = relativePath.split('/');
    if (!storageKey) return null;

    const absolutePath = resolve(config.discover.storageRoot, relativePath);
    const root = resolve(config.discover.storageRoot);
    if (absolutePath !== root && !absolutePath.startsWith(root + sep)) {
      return null;
    }

    return {
      storageKey,
      filePath: absolutePath,
    };
  }

  private static async compressSingleImage(file: File, postDir: string, storageKey: string, index: number) {
    if (file.size > config.discover.imageMaxBytes) {
      throw new AppError(ErrorCode.PARAM_ERROR, `单张图片不能超过 ${Math.floor(config.discover.imageMaxBytes / 1024 / 1024)}MB`);
    }

    const source = Buffer.from(await file.arrayBuffer());
    const { data, info, sourceMetadata, isAnimated, heicFallbackUsed } = await this.transformToWebp(source, file);
    const outputName = `${String(index + 1).padStart(2, '0')}.webp`;
    const outputPath = join(postDir, outputName);

    const width = info.width || sourceMetadata.width || 0;
    const height = isAnimated
      ? info.pageHeight || sourceMetadata.pageHeight || info.height || sourceMetadata.height || 0
      : info.height || sourceMetadata.height || 0;

    if (heicFallbackUsed) {
      Logger.warn('DiscoverMedia', `HEIC 兜底转码成功: ${file.name || 'unknown-file'}`);
    }

    await writeFile(outputPath, data);
    return {
      url: `${config.discover.mediaBasePath}/${storageKey}/${outputName}`,
      width,
      height,
      sizeBytes: data.byteLength,
      mimeType: 'image/webp',
    };
  }

  private static async transformToWebp(source: Buffer, file: File) {
    const heifCandidate = this.isHeifFamilyInput(file, source);
    try {
      return await this.transformBufferToWebp(source, false, heifCandidate);
    } catch (err) {
      if (!heifCandidate) {
        throw err;
      }

      const fallbackSource = await this.convertHeifToPng(source);
      return this.transformBufferToWebp(fallbackSource, true);
    }
  }

  private static async transformBufferToWebp(source: Buffer, heicFallbackUsed = false, suppressFailureLog = false) {
    const sourceMetadata = await this.readSourceMetadata(source);
    const isAnimated = this.isAnimatedImage(sourceMetadata);

    try {
      const transformer = sharp(source, isAnimated ? { animated: true, pages: -1 } : undefined)
        .rotate()
        .resize({
          width: config.discover.imageMaxDimension,
          height: config.discover.imageMaxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        });

      const { data, info } = await transformer
        .webp(
          isAnimated
            ? {
              quality: config.discover.imageQuality,
              effort: 4,
              loop: sourceMetadata.loop ?? 0,
              delay: sourceMetadata.delay,
              mixed: true,
            }
            : { quality: config.discover.imageQuality }
        )
        .toBuffer({ resolveWithObject: true });

      return {
        data,
        info,
        sourceMetadata,
        isAnimated,
        heicFallbackUsed,
      };
    } catch (err) {
      if (!suppressFailureLog) {
        Logger.error('DiscoverMedia', '图片压缩失败', err);
      }
      throw new AppError(ErrorCode.PARAM_ERROR, '图片处理失败，请更换图片后重试');
    }
  }

  private static async convertHeifToPng(source: Buffer) {
    try {
      const converted = await heicConvert({
        buffer: source,
        format: 'PNG',
      });
      const data = Buffer.isBuffer(converted)
        ? converted
        : converted instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(converted))
          : Buffer.from(converted);
      if (data.byteLength === 0) {
        throw new Error('HEIC 转码结果为空');
      }
      return data;
    } catch (err) {
      Logger.error('DiscoverMedia', 'HEIC 兜底转码失败', err);
      throw new AppError(ErrorCode.PARAM_ERROR, 'HEIC 图片处理失败，请在相册中编辑后重试');
    }
  }

  private static isHeifFamilyInput(file: File, source: Buffer) {
    const mimeType = (file.type || '').trim().toLowerCase();
    if (mimeType && HEIF_MIME_RE.test(mimeType)) return true;
    if (file.name && HEIF_FILE_EXT_RE.test(file.name)) return true;
    return this.hasHeifBrand(source);
  }

  private static hasHeifBrand(source: Buffer) {
    if (source.length < 12) return false;
    if (source.toString('ascii', 4, 8) !== 'ftyp') return false;

    const majorBrand = source.toString('ascii', 8, 12);
    if (HEIF_BRANDS.has(majorBrand)) return true;

    const compatibleBrandsEnd = Math.min(source.length, 64);
    for (let offset = 16; offset + 4 <= compatibleBrandsEnd; offset += 4) {
      const brand = source.toString('ascii', offset, offset + 4);
      if (HEIF_BRANDS.has(brand)) return true;
    }
    return false;
  }

  private static async readSourceMetadata(source: Buffer): Promise<Metadata> {
    try {
      const metadata = await sharp(source, { animated: true, pages: -1 }).metadata();
      if (!metadata.format || !SUPPORTED_INPUT_FORMATS.has(metadata.format)) {
        throw new AppError(ErrorCode.PARAM_ERROR, SUPPORTED_FORMAT_MESSAGE);
      }
      return metadata;
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }

      Logger.error('DiscoverMedia', '不支持的图片格式', err);
      throw new AppError(ErrorCode.PARAM_ERROR, SUPPORTED_FORMAT_MESSAGE);
    }
  }

  private static isAnimatedImage(metadata: Metadata) {
    return Boolean(
      (metadata.pages ?? 1) > 1
      && (
        (Array.isArray(metadata.delay) && metadata.delay.length > 0)
        || typeof metadata.loop === 'number'
      )
    );
  }
}
