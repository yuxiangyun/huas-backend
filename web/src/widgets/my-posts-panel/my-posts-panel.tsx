/**
 * [INPUT]: 依赖调用方提供的 Discover 帖子、分页状态、媒体 URL 与打开动作
 * [OUTPUT]: 对外提供 MyPostsPanel，展示当前用户的好饭发布列表
 * [POS]: widgets/my-posts-panel 的无请求展示组件，不重复页面标题与统计摘要
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Heart, MessageCircle } from 'lucide-react';
import type { DiscoverPost } from '@/entities/discover/model/discover-types';
import { buildMediaUrl } from '@/shared/api/media';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

interface MyPostsPanelProps {
  hasMore?: boolean;
  loadingMore?: boolean;
  loading?: boolean;
  posts: DiscoverPost[];
  onLoadMore?: () => void;
  onOpenPost?: (postId: number) => void;
}

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function MyPostsPanel({ hasMore = false, loading = false, loadingMore = false, posts, onLoadMore, onOpenPost }: MyPostsPanelProps) {
  if (loading) {
    return <div className="space-y-3" aria-hidden="true">{Array.from({ length: 2 }, (_, index) => <Card key={index} className="overflow-hidden p-0"><div className="aspect-[16/10] animate-pulse bg-shell-strong" /><div className="m-4 h-5 w-1/2 animate-pulse rounded bg-shell-strong" /></Card>)}</div>;
  }

  if (posts.length === 0) return <Card><p className="text-sm text-muted">暂无发布</p></Card>;

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <button key={post.id} className="feed-card-trigger" style={{ contentVisibility: 'auto', containIntrinsicSize: '280px' }} type="button" onClick={() => onOpenPost?.(post.id)}>
          <Card className="overflow-hidden p-0 transition-colors hover:border-[#d4d4d4] sm:grid sm:grid-cols-[11rem_minmax(0,1fr)]">
            {post.coverUrl ? <img alt={post.title || '推荐图片'} className="aspect-[16/10] h-full w-full object-cover sm:aspect-square" loading="lazy" src={buildMediaUrl(post.coverUrl)} /> : <div className="aspect-[16/10] bg-tint-soft sm:aspect-square" />}
            <div className="min-w-0 space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-clamp-2 text-base font-semibold">{post.title || post.category}</p><p className="mt-1 truncate text-sm text-muted">{[post.category, post.storeName].filter(Boolean).join(' · ')}</p></div>
                {post.priceText ? <span className="shrink-0 text-sm font-medium">{post.priceText}</span> : null}
              </div>
              <p className="text-clamp-2 text-sm leading-6 text-muted">{post.content}</p>
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <span>{formatPublishedAt(post.publishedAt)}</span>
                <span className="flex items-center gap-3"><span className="inline-flex items-center gap-1"><Heart aria-hidden="true" className="size-3.5" />{post.likeCount}</span><span className="inline-flex items-center gap-1"><MessageCircle aria-hidden="true" className="size-3.5" />{post.commentCount}</span></span>
              </div>
            </div>
          </Card>
        </button>
      ))}
      {hasMore ? <div className="flex justify-center"><Button disabled={loadingMore} size="sm" type="button" variant="secondary" onClick={onLoadMore}>{loadingMore ? '加载中…' : '加载更多'}</Button></div> : null}
    </div>
  );
}
