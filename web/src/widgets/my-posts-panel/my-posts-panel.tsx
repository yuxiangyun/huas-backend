/**
 * [INPUT]: 依赖调用方提供的 Discover 帖子、分页状态和打开/刷新动作
 * [OUTPUT]: 对外提供 MyPostsPanel，展示当前用户的 Discover 内容列表与分页状态
 * [POS]: widgets/my-posts-panel 的无请求展示组件，由个人内容页持有数据获取和路由语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import type { DiscoverPost } from '@/entities/discover/model/discover-types';
import { buildMediaUrl } from '@/shared/api/media';
import { Comment20Filled } from '@fluentui/react-icons/svg/comment';

interface MyPostsPanelProps {
  hasMore?: boolean;
  loadingMore?: boolean;
  loading?: boolean;
  posts: DiscoverPost[];
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

export function MyPostsPanel({
  hasMore = false,
  loading = false,
  loadingMore = false,
  posts,
  totalCount,
  onLoadMore,
  onOpenPost,
  onRefresh,
  refreshing = false,
}: MyPostsPanelProps) {
  const displayCount = totalCount ?? posts.length;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index} className="space-y-3">
            <div className="aspect-[16/10] animate-pulse rounded-[1.1rem] bg-shell-strong" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-shell-strong" />
            <div className="h-4 w-full animate-pulse rounded bg-shell-strong" />
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
              <p className="text-base font-semibold text-ink">我的发布</p>
              <span className="rounded-pill bg-white/80 px-3 py-1 text-xs font-medium text-muted ring-1 ring-line">
                {displayCount} 篇
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
          <p className="text-base font-semibold text-ink">还没有发布</p>
          <p className="text-sm leading-6 text-muted">
            去发第一条
          </p>
        </Card>
      ) : null}

      {posts.map((post) => (
        <button
          key={post.id}
          className="feed-card-trigger active:scale-[0.995] motion-reduce:transform-none"
          type="button"
          onClick={() => onOpenPost?.(post.id)}
        >
          <Card className="overflow-hidden p-0 shadow-none transition motion-reduce:transition-none sm:hover:-translate-y-0.5 sm:hover:bg-card-strong">
            <div className="grid min-w-0 gap-0 sm:grid-cols-[12rem_minmax(0,1fr)]">
              {post.coverUrl ? (
                <img
                  alt={post.title || '帖子封面'}
                  className="aspect-[16/10] h-full w-full object-cover sm:aspect-[4/3]"
                  loading="lazy"
                  src={buildMediaUrl(post.coverUrl)}
                />
              ) : (
                <div className="aspect-[16/10] bg-shell-strong sm:aspect-[4/3]" />
              )}

              <div className="min-w-0 space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-pill bg-tint-soft px-3 py-1 text-xs font-medium text-ink">
                    {post.category}
                  </span>
                  {post.storeName ? (
                    <span className="max-w-full truncate rounded-pill bg-white/80 px-3 py-1 text-xs text-muted ring-1 ring-line sm:max-w-[18rem]">
                      {post.storeName}
                    </span>
                  ) : null}
                  {post.priceText ? (
                    <span className="max-w-full truncate rounded-pill bg-white/80 px-3 py-1 text-xs text-muted ring-1 ring-line">
                      {post.priceText}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <p className="text-clamp-2 break-words text-base font-semibold text-ink sm:text-lg">
                    {post.title || `${post.category} · 我的发布`}
                  </p>
                  <p className="text-clamp-2 text-sm leading-6 text-muted sm:leading-7">
                    {post.content || '未填写'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2.5 text-[0.82rem] text-muted sm:text-sm">
                  <span>{formatPublishedAt(post.publishedAt)}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Comment20Filled aria-hidden="true" className="size-4" />
                    {post.rating.average.toFixed(1)} 分 · {post.rating.count} 人 · {post.commentCount} 条评论 · {post.imageCount} 张图
                  </span>
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
