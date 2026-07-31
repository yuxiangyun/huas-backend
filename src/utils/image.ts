/**
 * [INPUT]: 依赖 sharp 的真实图片解码/旋转/缩放/WebP 编码，依赖 heic-convert 提供 HEIC/HEIF 解码兜底
 * [OUTPUT]: 对外提供 transformImageToWebp 无状态图片转换函数及其选项、结果类型
 * [POS]: utils 的共享图片处理边界，统一 Discover、Community 与 Messaging 的内容识别和压缩语义，不负责存储与权限
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import heicConvert from 'heic-convert';
import sharp, { type Metadata } from 'sharp';
import { AppError, ErrorCode } from './errors';

export type ImageTransformFit = 'inside' | 'cover';

export interface ImageTransformOptions {
  maxInputBytes: number;
  maxDimension: number;
  quality: number;
  fit?: ImageTransformFit;
}

export interface TransformedWebpImage {
  data: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/webp';
}

const SUPPORTED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'avif', 'tiff']);
const SUPPORTED_FORMAT_MESSAGE = '仅支持 JPG、PNG、WebP、GIF、HEIC、HEIF、AVIF、TIFF 图片格式';
const HEIF_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx',
  'heim', 'heis', 'hevm', 'hevs',
  'mif1', 'msf1',
]);

export async function transformImageToWebp(
  file: File,
  options: ImageTransformOptions,
): Promise<TransformedWebpImage> {
  const normalizedOptions = validateInput(file, options);
  const source = Buffer.from(await file.arrayBuffer());
  const heifCandidate = hasHeifBrand(source);

  try {
    return await transformBufferToWebp(source, normalizedOptions);
  } catch (error) {
    if (!heifCandidate) throw error;

    const fallbackSource = await convertHeifToPng(source);
    return transformBufferToWebp(fallbackSource, normalizedOptions);
  }
}

function validateInput(file: File, options: ImageTransformOptions): Required<ImageTransformOptions> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, '图片文件不能为空');
  }

  if (!Number.isSafeInteger(options?.maxInputBytes) || options.maxInputBytes <= 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, '图片输入大小限制不合法');
  }
  if (file.size > options.maxInputBytes) {
    throw new AppError(ErrorCode.PARAM_ERROR, '图片超过允许的大小限制');
  }
  if (!Number.isSafeInteger(options.maxDimension) || options.maxDimension <= 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, '图片尺寸限制不合法');
  }
  if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) {
    throw new AppError(ErrorCode.PARAM_ERROR, '图片压缩质量必须是 1 到 100 的整数');
  }

  const fit = options.fit ?? 'inside';
  if (fit !== 'inside' && fit !== 'cover') {
    throw new AppError(ErrorCode.PARAM_ERROR, '图片缩放模式不合法');
  }

  return {
    maxInputBytes: options.maxInputBytes,
    maxDimension: options.maxDimension,
    quality: options.quality,
    fit,
  };
}

async function transformBufferToWebp(
  source: Buffer,
  options: Required<ImageTransformOptions>,
): Promise<TransformedWebpImage> {
  const metadata = await readSupportedMetadata(source);
  const animated = isAnimated(metadata);

  try {
    const transformer = sharp(source, animated ? { animated: true, pages: -1 } : undefined)
      .rotate()
      .resize(resizeOptions(options));
    const webpOptions = animated
      ? {
        quality: options.quality,
        effort: 4,
        loop: metadata.loop ?? 0,
        delay: metadata.delay,
        mixed: true,
      }
      : { quality: options.quality };
    const { data, info } = await transformer
      .webp(webpOptions)
      .toBuffer({ resolveWithObject: true });

    return {
      data,
      width: info.width,
      height: animated ? info.pageHeight || info.height : info.height,
      sizeBytes: data.byteLength,
      mimeType: 'image/webp',
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(ErrorCode.PARAM_ERROR, '图片处理失败，请更换图片后重试');
  }
}

function resizeOptions(options: Required<ImageTransformOptions>) {
  if (options.fit === 'cover') {
    return {
      width: options.maxDimension,
      height: options.maxDimension,
      fit: 'cover' as const,
      position: 'centre' as const,
    };
  }

  return {
    width: options.maxDimension,
    height: options.maxDimension,
    fit: 'inside' as const,
    withoutEnlargement: true,
  };
}

async function readSupportedMetadata(source: Buffer): Promise<Metadata> {
  try {
    const metadata = await sharp(source, { animated: true, pages: -1 }).metadata();
    if (!metadata.format || !SUPPORTED_INPUT_FORMATS.has(metadata.format)) {
      throw new AppError(ErrorCode.PARAM_ERROR, SUPPORTED_FORMAT_MESSAGE);
    }
    return metadata;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(ErrorCode.PARAM_ERROR, SUPPORTED_FORMAT_MESSAGE);
  }
}

function isAnimated(metadata: Metadata) {
  return Boolean(
    (metadata.pages ?? 1) > 1
    && (
      (Array.isArray(metadata.delay) && metadata.delay.length > 0)
      || typeof metadata.loop === 'number'
    )
  );
}

function hasHeifBrand(source: Buffer) {
  if (source.length < 12 || source.toString('ascii', 4, 8) !== 'ftyp') return false;
  if (HEIF_BRANDS.has(source.toString('ascii', 8, 12))) return true;

  const compatibleBrandsEnd = Math.min(source.length, 64);
  for (let offset = 16; offset + 4 <= compatibleBrandsEnd; offset += 4) {
    if (HEIF_BRANDS.has(source.toString('ascii', offset, offset + 4))) return true;
  }
  return false;
}

async function convertHeifToPng(source: Buffer) {
  try {
    const converted = await heicConvert({ buffer: source, format: 'PNG' });
    const data = Buffer.isBuffer(converted)
      ? converted
      : converted instanceof ArrayBuffer
        ? Buffer.from(new Uint8Array(converted))
        : Buffer.from(converted);

    if (data.byteLength === 0) throw new Error('HEIC 转码结果为空');
    return data;
  } catch {
    throw new AppError(ErrorCode.PARAM_ERROR, 'HEIC 图片处理失败，请更换图片后重试');
  }
}
