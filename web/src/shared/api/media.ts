/**
 * [INPUT]: 依赖 API 基地址与服务端返回的公开媒体相对/绝对 URL
 * [OUTPUT]: 对外提供 buildMediaUrl，规范化可直接用于公开媒体元素的地址
 * [POS]: shared/api 的公开媒体地址边界，不用于需要 Bearer 或 Cookie 的私有图片
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { API_BASE_URL } from '@/shared/config/env';

export function buildMediaUrl(url: string) {
  if (!url) return '';
  if (
    url.startsWith('http://')
    || url.startsWith('https://')
    || url.startsWith('blob:')
    || url.startsWith('data:')
  ) {
    return url;
  }
  return `${API_BASE_URL}${url}`;
}
