import type { TreeholePost } from '@/entities/treehole/model/treehole-types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { TreeholeAvatar } from '@/shared/ui/treehole-avatar';

interface MyTreeholePostsPanelProps {
  hasMore?: boolean;
  loadingMore?: boolean;
  loading?: boolean;
  posts: TreeholePost[];
  totalCount?: number;
  onLoadMore?: () => void;
  onOpenPost?: (postId: number) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MyTreeholePostsPanel({
  hasMore = false,
  loading = false,
  loadingMore = false,
  posts,
  totalCount,
  onLoadMore,
  onOpenPost,
  onRefresh,
  refreshing = false,
}: MyTreeholePostsPanelProps) {
  const displayCount = totalCount ?? posts.length;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="size-10 animate-pulse rounded-[0.8rem] bg-shell-strong" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-5 w-24 animate-pulse rounded bg-shell-strong" />
                <div className="h-24 animate-pulse rounded-[1.15rem] bg-shell-strong" />
                <div className="h-4 w-32 animate-pulse rounded bg-shell-strong" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-2 bg-card-strong">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-ink">我的树洞</p>
              <span className="rounded-pill bg-white/80 px-3 py-1 text-xs font-medium text-muted ring-1 ring-line">
                {displayCount} 条
              </span>
            </div>
            <p className="text-sm leading-6 text-muted">
              查看自己发的内容
            </p>
          </div>
          <Button
            className="min-w-[5.75rem]"
            size="xs"
            type="button"
            variant="subtle"
            onClick={onRefresh}
          >
            {refreshing ? '刷新中...' : '刷新'}
          </Button>
        </div>
      </Card>

      {posts.length === 0 ? (
        <Card className="space-y-2">
          <p className="text-base font-semibold text-ink">还没有树洞</p>
          <p className="text-sm leading-6 text-muted">
            去发第一条
          </p>
        </Card>
      ) : null}

      {posts.map((post) => (
        <button
          key={post.id}
          className="block w-full text-left active:scale-[0.995]"
          type="button"
          onClick={() => onOpenPost?.(post.id)}
        >
          <Card className="space-y-4 shadow-none transition hover:-translate-y-0.5 hover:bg-card-strong">
            <div className="flex items-start gap-3">
              <TreeholeAvatar src={post.avatarUrl} />
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-pill bg-tint-soft px-3 py-1 text-xs font-medium text-ink">
                      匿名树洞
                    </span>
                    <span className="rounded-pill bg-white/80 px-3 py-1 text-xs text-muted ring-1 ring-line">
                      我的
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{formatPublishedAt(post.publishedAt)}</span>
                </div>

                <p className="text-clamp-4 text-sm leading-7 whitespace-pre-wrap text-ink">
                  {post.content}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2.5 text-sm text-muted">
                  <span>{post.stats.likeCount} 个赞</span>
                  <span>{post.stats.commentCount} 条评论</span>
                </div>
              </div>
            </div>
          </Card>
        </button>
      ))}

      {posts.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          {hasMore ? (
            <Button
              className="min-w-[6rem]"
              size="sm"
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
