/**
 * [INPUT]: 依赖调用方提供的 Treehole 图文帖子、Bearer 私有媒体、分页状态与打开动作
 * [OUTPUT]: 对外提供 MyTreeholePostsPanel，以首图缩略图和正文摘要展示当前用户的树洞动态
 * [POS]: widgets/my-treehole-posts-panel 的无请求图文列表，不重复页面标题与统计摘要
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Heart, MessageCircle } from 'lucide-react';
import type { TreeholePost } from '@/entities/treehole/model/treehole-types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
import { PrivateMediaImage } from '@/shared/ui/private-media-image';

interface MyTreeholePostsPanelProps {
  hasMore?: boolean;
  loadingMore?: boolean;
  loading?: boolean;
  posts: TreeholePost[];
  onLoadMore?: () => void;
  onOpenPost?: (postId: number) => void;
}

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function MyTreeholePostsPanel({ hasMore = false, loading = false, loadingMore = false, posts, onLoadMore, onOpenPost }: MyTreeholePostsPanelProps) {
  if (loading) {
    return <div className="space-y-3" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <Card key={index} className="space-y-3"><div className="h-4 w-24 animate-pulse rounded bg-shell-strong" /><div className="h-20 animate-pulse rounded bg-shell-strong" /></Card>)}</div>;
  }

  if (posts.length === 0) return <Card><p className="text-sm text-muted">暂无发布</p></Card>;

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <button key={post.id} className="feed-card-trigger" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 230px' }} type="button" onClick={() => onOpenPost?.(post.id)}>
          <Card className={post.images.length > 0 ? 'overflow-hidden p-0 transition-colors hover:border-[#d4d4d4] sm:grid sm:grid-cols-[10rem_minmax(0,1fr)]' : 'space-y-4 transition-colors hover:border-[#d4d4d4]'}>
            {post.images[0] ? (
              <PrivateMediaImage
                alt="帖子首图"
                className="aspect-[4/3] size-full min-h-44 object-contain sm:aspect-square sm:min-h-0"
                decoding="async"
                height={post.images[0].height}
                src={post.images[0].url}
                width={post.images[0].width}
              />
            ) : null}
            <div className={post.images.length > 0 ? 'min-w-0 space-y-4 p-4' : 'contents'}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2"><CommunityAvatar className="size-7 rounded-full text-[0.65rem]" src={post.author.avatarUrl} /><span className="truncate text-sm font-medium">{post.author.displayName}</span></span>
                <span className="shrink-0 text-xs text-muted">{formatPublishedAt(post.publishedAt)}</span>
              </div>
              <p className="text-clamp-4 break-words text-sm leading-7 whitespace-pre-wrap">{post.content}</p>
              <div className="flex items-center gap-4 text-xs text-muted"><span className="inline-flex items-center gap-1"><Heart aria-hidden="true" className="size-4" />{post.stats.likeCount}</span><span className="inline-flex items-center gap-1"><MessageCircle aria-hidden="true" className="size-4" />{post.stats.commentCount}</span>{post.imageCount > 1 ? <span>{post.imageCount} 张图片</span> : null}</div>
            </div>
          </Card>
        </button>
      ))}
      {hasMore ? <div className="flex justify-center"><Button disabled={loadingMore} size="sm" type="button" variant="secondary" onClick={onLoadMore}>{loadingMore ? '加载中…' : '加载更多'}</Button></div> : null}
    </div>
  );
}
