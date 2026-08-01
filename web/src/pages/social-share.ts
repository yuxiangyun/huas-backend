/**
 * [INPUT]: 依赖 Social canonical 路径、浏览器系统分享/剪贴板能力与当前站点 origin
 * [OUTPUT]: 对外提供 shareSocialPost，优先系统分享并回退复制可深链的帖子 URL
 * [POS]: pages 的路由级分享规则，业务 widgets 只提交帖子事实而不自行拼接导航地址
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { buildAppPath } from '@/shared/config/env';

export type SocialShareResult = 'shared' | 'copied' | 'cancelled';

interface ShareSocialPostInput {
  path: string;
  postId: number;
  text: string;
  title: string;
}

export async function shareSocialPost({ path, postId, text, title }: ShareSocialPostInput): Promise<SocialShareResult> {
  const search = new URLSearchParams({ postId: String(postId) });
  const url = new URL(`${buildAppPath(path)}?${search}`, window.location.origin).toString();
  const shareText = Array.from(text.trim()).slice(0, 100).join('');

  if (navigator.share) {
    try {
      await navigator.share({ title, text: shareText, url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return 'copied';
  }

  window.prompt('复制帖子链接', url);
  return 'copied';
}
