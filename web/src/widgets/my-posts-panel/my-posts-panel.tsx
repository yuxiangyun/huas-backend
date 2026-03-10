import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import type { DiscoverPost } from '@/entities/discover/model/discover-types';
import { buildMediaUrl } from '@/shared/api/media';

interface MyPostsPanelProps {
  hasMore?: boolean;
  loadingMore?: boolean;
  loading?: boolean;
  posts: DiscoverPost[];
  onLoadMore?: () => void;
  onOpenPost?: (postId: number) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function MyPostsPanel({
  hasMore = false,
  loading = false,
  loadingMore = false,
  posts,
  onLoadMore,
  onOpenPost,
  onRefresh,
  refreshing = false,
}: MyPostsPanelProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index} className="space-y-3">
            <div className="h-40 animate-pulse rounded-[1.3rem] bg-shell-strong" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-shell-strong" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2 bg-card-strong">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-ink">我的发布</p>
              <span className="rounded-pill bg-white/80 px-3 py-1 text-xs font-medium text-muted ring-1 ring-line">
                {posts.length} 篇
              </span>
            </div>
            <p className="text-sm leading-6 text-muted">
              你分享过的每一顿都会留在这里，点开就能继续查看和管理。
            </p>
          </div>
          <Button
            className="min-w-[5.75rem]"
            size="sm"
            type="button"
            variant="ghost"
            onClick={onRefresh}
          >
            {refreshing ? '刷新中...' : '刷新'}
          </Button>
        </div>
      </Card>

      {posts.length === 0 ? (
        <Card className="space-y-2">
          <p className="text-base font-semibold text-ink">还没有发布</p>
          <p className="text-sm leading-6 text-muted">
            等你分享第一顿好饭，这里就会慢慢丰富起来。
          </p>
        </Card>
      ) : null}

      {posts.map((post) => (
        <button
          key={post.id}
          className="block w-full text-left"
          type="button"
          onClick={() => onOpenPost?.(post.id)}
        >
          <Card className="space-y-3 transition hover:-translate-y-0.5 hover:bg-card-strong">
            {post.coverUrl ? (
              <img
                alt={post.title || '帖子封面'}
                className="aspect-[4/3] w-full rounded-[1.3rem] object-cover"
                loading="lazy"
                src={buildMediaUrl(post.coverUrl)}
              />
            ) : null}
            <div className="space-y-1">
              <p className="text-base font-semibold text-ink">
                {post.title || `${post.category} · 我的发布`}
              </p>
              <p className="text-sm text-muted">
                {post.category} · {new Date(post.publishedAt).toLocaleString('zh-CN')}
              </p>
            </div>
            <div className="flex items-center justify-between text-sm text-muted">
              <span>{post.imageCount} 张图</span>
              <span>
                {post.rating.average.toFixed(1)} 分 · {post.rating.count} 人
              </span>
            </div>
          </Card>
        </button>
      ))}

      {posts.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          {hasMore ? (
            <Button
              className="min-w-[6rem]"
              size="md"
              type="button"
              variant="secondary"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? '加载中...' : '加载更多'}
            </Button>
          ) : (
            <span className="text-sm text-muted">已经到底了</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
