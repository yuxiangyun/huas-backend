/**
 * [INPUT]: 依赖共享图片上传准备层与 Treehole 服务端下发的图片限制
 * [OUTPUT]: 对外提供 Treehole 兼容的图片接收、格式判断、WebP 预处理与字节格式化接口
 * [POS]: features/treehole-create-post 的策略适配层，把 Treehole 动态限制映射到跨 Social 共享媒体能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { TreeholeMeta } from '@/entities/treehole/model/treehole-types';
import {
  formatBytes,
  isSupportedUploadImage,
  prepareUploadImages,
  SOCIAL_IMAGE_ACCEPT,
} from '@/shared/lib/image-upload-processing';

type TreeholeImageLimits = TreeholeMeta['limits'];
export const TREEHOLE_IMAGE_ACCEPT = SOCIAL_IMAGE_ACCEPT;
export const isSupportedTreeholeImage = isSupportedUploadImage;

export async function prepareTreeholeImages(
  files: readonly File[],
  limits: TreeholeImageLimits
) {
  return prepareUploadImages(files, {
    maxFiles: limits.maxImagesPerPost,
    maxInputBytes: limits.maxImageBytes,
    maxTotalBytes: limits.maxImageTotalBytes,
    maxPixels: limits.maxImagePixels,
    maxOutputBytes: limits.maxOutputImageBytes,
    maxDimension: limits.imageMaxDimension,
    quality: limits.imageQuality / 100,
  });
}

export { formatBytes };
