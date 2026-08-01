/**
 * [INPUT]: 依赖浏览器 ImageBitmap/Canvas、调用方提供的文件数量/像素/字节策略
 * [OUTPUT]: 对外提供图片格式判断、串行静态 WebP 预处理、格式化字节与单图/上传总量硬校验
 * [POS]: shared/lib 的 Social 图片上传准备层，复用压缩规则但不替代各服务端媒体安全门禁
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const SOCIAL_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif,image/tiff,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.avif,.tif,.tiff';

const SUPPORTED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'heic',
  'heif',
  'avif',
  'tif',
  'tiff',
]);
const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/avif',
  'image/tiff',
]);

// 动画容器不在浏览器端转码，避免把 GIF/WebP/AVIF 静默截成首帧。
const STATIC_CANVAS_INPUT_TYPES = new Set(['image/jpeg', 'image/png']);

export interface UploadImageLimits {
  maxFiles: number;
  maxInputBytes: number;
  maxTotalBytes: number;
  maxPixels: number;
  maxOutputBytes: number;
  maxDimension: number;
  quality: number;
}

function fileExtension(fileName: string) {
  return fileName.split('.').at(-1)?.toLowerCase() ?? '';
}

export function isSupportedUploadImage(file: File) {
  return SUPPORTED_MIME_TYPES.has(file.type.toLowerCase())
    || SUPPORTED_EXTENSIONS.has(fileExtension(file.name));
}

function webpFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/u, '').trim() || 'image';
  return `${baseName}.webp`;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

async function compressStaticImage(file: File, limits: UploadImageLimits) {
  if (!STATIC_CANVAS_INPUT_TYPES.has(file.type) || typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  try {
    const pixelCount = bitmap.width * bitmap.height;
    if (!Number.isSafeInteger(pixelCount) || pixelCount > limits.maxPixels) {
      throw new Error(`图片像素不能超过 ${(limits.maxPixels / 1_000_000).toFixed(0)}MP`);
    }

    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const requiresResize = longestEdge > limits.maxDimension;
    const requiresCompression = file.size > limits.maxOutputBytes;
    if (!requiresResize && !requiresCompression && file.type === 'image/webp') return file;

    let scale = Math.min(1, limits.maxDimension / longestEdge);
    let quality = Math.min(0.92, Math.max(0.45, limits.quality));
    let bestBlob: Blob | null = null;

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) break;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await canvasToBlob(canvas, quality);
      canvas.width = 1;
      canvas.height = 1;
      if (!blob) break;
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
      if (blob.size <= limits.maxOutputBytes) break;

      if (attempt % 2 === 0 && quality > 0.5) quality = Math.max(0.46, quality - 0.1);
      else scale *= 0.82;
    }

    if (!bestBlob || bestBlob.size >= file.size) return file;
    return new File([bestBlob], webpFileName(file.name), {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

export async function prepareUploadImages(
  files: readonly File[],
  limits: UploadImageLimits,
) {
  if (files.length > limits.maxFiles) {
    throw new Error(`最多选择 ${limits.maxFiles} 张图片`);
  }

  const prepared: File[] = [];
  for (const sourceFile of files) {
    if (!isSupportedUploadImage(sourceFile)) {
      throw new Error('请选择 JPG、PNG、WebP、GIF、HEIC、AVIF 或 TIFF 图片');
    }
    if (sourceFile.size <= 0) throw new Error('图片文件不能为空');
    if (sourceFile.size > limits.maxInputBytes) {
      throw new Error(`单张原图不能超过 ${formatBytes(limits.maxInputBytes)}`);
    }

    // 串行处理避免移动端同时解码多张大图造成瞬时内存峰值。
    const file = await compressStaticImage(sourceFile, limits);
    if (file.size > limits.maxOutputBytes) {
      throw new Error(`当前浏览器无法将图片处理到 ${formatBytes(limits.maxOutputBytes)} 以内，请先缩小图片`);
    }
    prepared.push(file);
  }

  const totalBytes = prepared.reduce((total, file) => total + file.size, 0);
  if (totalBytes > limits.maxTotalBytes) {
    throw new Error(`全部图片不能超过 ${formatBytes(limits.maxTotalBytes)}`);
  }
  return prepared;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    const value = bytes / (1024 * 1024);
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} MB`;
  }
  return `${Math.ceil(bytes / 1024)} KB`;
}
