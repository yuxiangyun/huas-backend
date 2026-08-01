/**
 * [INPUT]: 依赖 sharp 的单线程无缓存受限元数据探测、EXIF 旋转、缩放与 WebP 编码，依赖 heic-convert 仅在已完成像素门禁后提供 HEIC/HEIF 解码兜底
 * [OUTPUT]: 对外提供 transformImageToWebp 串行图片转换函数及输入字节、总解码像素、页数、动画策略与严格输出字节上限选项
 * [POS]: utils 的共享低内存图片处理边界，统一媒体内容识别与有界自适应压缩，不负责业务存储、权限或多文件并发编排
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
  maxInputPixels?: number;
  maxPages?: number;
  allowAnimated?: boolean;
  maxOutputBytes?: number;
}

export interface TransformedWebpImage {
  data: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/webp';
}

interface NormalizedImageTransformOptions {
  maxInputBytes: number;
  maxDimension: number;
  quality: number;
  fit: ImageTransformFit;
  maxInputPixels?: number;
  maxPages?: number;
  allowAnimated: boolean;
  maxOutputBytes?: number;
}

interface CompressionAttempt {
  dimension: number;
  quality: number;
}

const SUPPORTED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'avif', 'tiff']);
const SUPPORTED_FORMAT_MESSAGE = '仅支持 JPG、PNG、WebP、GIF、HEIC、HEIF、AVIF、TIFF 图片格式';
const PROCESS_FAILED_MESSAGE = '图片处理失败，请更换图片后重试';
const PIXEL_LIMIT_MESSAGE = '图片像素过大，请降低分辨率后重试';
const PAGE_LIMIT_MESSAGE = '图片页数超过允许的限制';
const ANIMATION_REJECTED_MESSAGE = '暂不支持动态或多页图片';
const OUTPUT_LIMIT_MESSAGE = '图片压缩后仍超过允许的大小限制';
const MAX_COMPRESSION_ATTEMPTS = 6;
const MIN_ADAPTIVE_DIMENSION = 64;
const MIN_ADAPTIVE_QUALITY = 28;
const HEIF_FALLBACK_MAX_PIXELS = 16_000_000;
const HEIF_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx',
  'heim', 'heis', 'hevm', 'hevs',
  'mif1', 'msf1',
]);

// 512MB 运行目标下，禁用 libvips 默认 50MB operation cache，并限制单流水线 worker 数量。
// 进程内单槽负责图片级并发；这里负责单张图片内部的常驻缓存与并行 region 缓冲。
sharp.cache(false);
sharp.concurrency(1);

// sharp 的单次流水线仍会使用工作线程；这里串行化的是进程内图片任务，防止多请求同时持有解码缓冲区。
let imageTransformTail = Promise.resolve();

export async function transformImageToWebp(
  file: File,
  options: ImageTransformOptions,
): Promise<TransformedWebpImage> {
  const normalizedOptions = validateInput(file, options);

  return runImageTransformExclusive(async () => {
    // 必须在进入串行槽且完成 file.size 门禁后才复制正文，避免排队任务额外占用一份大 Buffer。
    const source = Buffer.from(await file.arrayBuffer());
    const heifCandidate = hasHeifBrand(source);
    let metadata: Metadata;
    try {
      metadata = await readSupportedMetadata(source, normalizedOptions);
    } catch (error) {
      // 无法由原生解码器安全取得 HEIF 尺寸时，不允许直接进入高内存 heic-convert 兜底。
      if (heifCandidate && isUnsupportedFormatFailure(error)) {
        throw new AppError(ErrorCode.PARAM_ERROR, PROCESS_FAILED_MESSAGE);
      }
      throw error;
    }
    validateMetadata(metadata, normalizedOptions);

    try {
      return await transformBufferToWebp(source, metadata, normalizedOptions);
    } catch (error) {
      if (!heifCandidate || !isProcessingFailure(error)) throw error;

      // heic-convert 会产生完整像素缓冲区，只允许在 sharp 已安全读到尺寸且通过硬上限后兜底。
      assertHeifFallbackIsSafe(metadata, normalizedOptions);
      const fallbackSource = await convertHeifToJpeg(source);
      const fallbackMetadata = await readSupportedMetadata(fallbackSource, normalizedOptions);
      validateMetadata(fallbackMetadata, normalizedOptions);
      return transformBufferToWebp(fallbackSource, fallbackMetadata, normalizedOptions);
    }
  });
}

function validateInput(
  file: File,
  options: ImageTransformOptions,
): NormalizedImageTransformOptions {
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
  if (options.maxInputPixels !== undefined
    && (!Number.isSafeInteger(options.maxInputPixels) || options.maxInputPixels <= 0)) {
    throw new AppError(ErrorCode.PARAM_ERROR, '图片像素限制不合法');
  }
  if (options.maxPages !== undefined
    && (!Number.isSafeInteger(options.maxPages) || options.maxPages <= 0)) {
    throw new AppError(ErrorCode.PARAM_ERROR, '图片页数限制不合法');
  }

  const allowAnimated = options.allowAnimated ?? true;
  if (typeof allowAnimated !== 'boolean') {
    throw new AppError(ErrorCode.PARAM_ERROR, '图片动画策略不合法');
  }
  if (options.maxOutputBytes !== undefined
    && (!Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes <= 0)) {
    throw new AppError(ErrorCode.PARAM_ERROR, '图片输出大小限制不合法');
  }

  return {
    maxInputBytes: options.maxInputBytes,
    maxDimension: options.maxDimension,
    quality: options.quality,
    fit,
    maxInputPixels: options.maxInputPixels,
    maxPages: options.maxPages,
    allowAnimated,
    maxOutputBytes: options.maxOutputBytes,
  };
}

async function transformBufferToWebp(
  source: Buffer,
  metadata: Metadata,
  options: NormalizedImageTransformOptions,
): Promise<TransformedWebpImage> {
  let attempt: CompressionAttempt = {
    dimension: options.maxDimension,
    quality: options.quality,
  };

  for (let attemptIndex = 0; attemptIndex < MAX_COMPRESSION_ATTEMPTS; attemptIndex += 1) {
    const transformed = await encodeWebpAttempt(source, metadata, options, attempt);
    if (options.maxOutputBytes === undefined || transformed.sizeBytes <= options.maxOutputBytes) {
      return transformed;
    }
    if (attemptIndex === MAX_COMPRESSION_ATTEMPTS - 1) break;

    attempt = nextCompressionAttempt(attempt, transformed.sizeBytes, options.maxOutputBytes);
  }

  throw new AppError(ErrorCode.PARAM_ERROR, OUTPUT_LIMIT_MESSAGE);
}

async function encodeWebpAttempt(
  source: Buffer,
  metadata: Metadata,
  options: NormalizedImageTransformOptions,
  attempt: CompressionAttempt,
): Promise<TransformedWebpImage> {
  const animated = isAnimated(metadata);

  try {
    const inputOptions = animated
      ? {
        animated: true,
        pages: -1,
        ...(options.maxInputPixels === undefined ? {} : { limitInputPixels: options.maxInputPixels }),
      }
      : {
        pages: 1,
        ...(options.maxInputPixels === undefined ? {} : { limitInputPixels: options.maxInputPixels }),
      };
    const transformer = sharp(source, inputOptions)
      .rotate()
      .resize(resizeOptions(options.fit, attempt.dimension));
    const webpOptions = animated
      ? {
        quality: attempt.quality,
        effort: 4,
        loop: metadata.loop ?? 0,
        delay: metadata.delay,
        mixed: true,
      }
      : { quality: attempt.quality };
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
    if (isSharpPixelLimitError(error)) {
      throw new AppError(ErrorCode.PARAM_ERROR, PIXEL_LIMIT_MESSAGE);
    }
    throw new AppError(ErrorCode.PARAM_ERROR, PROCESS_FAILED_MESSAGE);
  }
}

function nextCompressionAttempt(
  current: CompressionAttempt,
  currentBytes: number,
  maxOutputBytes: number,
): CompressionAttempt {
  const ratioScale = Math.sqrt(maxOutputBytes / currentBytes) * 0.92;
  const dimensionScale = Math.max(0.55, Math.min(0.85, ratioScale));
  const nextDimension = current.dimension > MIN_ADAPTIVE_DIMENSION
    ? Math.max(
      MIN_ADAPTIVE_DIMENSION,
      Math.min(current.dimension - 1, Math.floor(current.dimension * dimensionScale)),
    )
    : current.dimension;

  return {
    dimension: nextDimension,
    quality: Math.max(MIN_ADAPTIVE_QUALITY, current.quality - 10),
  };
}

function resizeOptions(fit: ImageTransformFit, maxDimension: number) {
  if (fit === 'cover') {
    return {
      width: maxDimension,
      height: maxDimension,
      fit: 'cover' as const,
      position: 'centre' as const,
    };
  }

  return {
    width: maxDimension,
    height: maxDimension,
    fit: 'inside' as const,
    withoutEnlargement: true,
  };
}

async function readSupportedMetadata(
  source: Buffer,
  options: NormalizedImageTransformOptions,
): Promise<Metadata> {
  try {
    // pages: 1 足以读取容器声明的总页数，不会像 pages: -1 一样请求解码全部帧。
    const metadata = await sharp(source, {
      pages: 1,
      ...(options.maxInputPixels === undefined ? {} : { limitInputPixels: options.maxInputPixels }),
    }).metadata();
    if (!metadata.format || !SUPPORTED_INPUT_FORMATS.has(metadata.format)) {
      throw new AppError(ErrorCode.PARAM_ERROR, SUPPORTED_FORMAT_MESSAGE);
    }
    return metadata;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (isSharpPixelLimitError(error)) {
      throw new AppError(ErrorCode.PARAM_ERROR, PIXEL_LIMIT_MESSAGE);
    }
    throw new AppError(ErrorCode.PARAM_ERROR, SUPPORTED_FORMAT_MESSAGE);
  }
}

function validateMetadata(
  metadata: Metadata,
  options: NormalizedImageTransformOptions,
) {
  const pages = metadata.pages ?? 1;
  if (!options.allowAnimated && pages > 1) {
    throw new AppError(ErrorCode.PARAM_ERROR, ANIMATION_REJECTED_MESSAGE);
  }
  if (options.maxPages !== undefined && pages > options.maxPages) {
    throw new AppError(ErrorCode.PARAM_ERROR, PAGE_LIMIT_MESSAGE);
  }
  if (options.maxInputPixels !== undefined
    && (decodedPixelCount(metadata, pages) ?? Number.POSITIVE_INFINITY) > options.maxInputPixels) {
    throw new AppError(ErrorCode.PARAM_ERROR, PIXEL_LIMIT_MESSAGE);
  }
}

function decodedPixelCount(metadata: Metadata, pages = metadata.pages ?? 1) {
  const width = metadata.width;
  const pageHeight = metadata.pageHeight ?? metadata.height;
  if (typeof width !== 'number' || typeof pageHeight !== 'number'
    || !Number.isSafeInteger(width) || !Number.isSafeInteger(pageHeight)
    || !Number.isSafeInteger(pages) || width <= 0 || pageHeight <= 0 || pages <= 0) {
    return null;
  }

  const pixels = width * pageHeight * pages;
  return Number.isSafeInteger(pixels) ? pixels : null;
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

function assertHeifFallbackIsSafe(
  metadata: Metadata,
  options: NormalizedImageTransformOptions,
) {
  const configuredLimit = options.maxInputPixels ?? HEIF_FALLBACK_MAX_PIXELS;
  const pixels = decodedPixelCount(metadata);
  if (pixels === null) {
    throw new AppError(ErrorCode.PARAM_ERROR, PROCESS_FAILED_MESSAGE);
  }
  if (pixels > Math.min(configuredLimit, HEIF_FALLBACK_MAX_PIXELS)) {
    throw new AppError(ErrorCode.PARAM_ERROR, PIXEL_LIMIT_MESSAGE);
  }
}

async function convertHeifToJpeg(source: Buffer) {
  try {
    // JPEG 避免 PNG 兜底在完整 RGBA 解码之外再制造巨大的无损中间文件。
    const converted = await heicConvert({ buffer: source, format: 'JPEG', quality: 0.82 });
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

function isProcessingFailure(error: unknown) {
  return error instanceof AppError && error.message === PROCESS_FAILED_MESSAGE;
}

function isUnsupportedFormatFailure(error: unknown) {
  return error instanceof AppError && error.message === SUPPORTED_FORMAT_MESSAGE;
}

function isSharpPixelLimitError(error: unknown) {
  return error instanceof Error && /pixel limit|exceeds.*pixels/i.test(error.message);
}

async function runImageTransformExclusive<T>(task: () => Promise<T>): Promise<T> {
  const previous = imageTransformTail;
  let release!: () => void;
  imageTransformTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}
