/**
 * [INPUT]: 依赖 Discover 无限列表、筛选控件、媒体 URL 与社区资料投影
 * [OUTPUT]: 对外提供 DiscoverFeed，以图片优先的信息层级呈现好饭推荐
 * [POS]: widgets/discover-feed 的只读信息流容器，负责状态与分页，不承载发布和路由状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Image, MessageCircle, Plus, Star } from 'lucide-react';
import type { DiscoverCategory, DiscoverSort } from '@/entities/discover/model/discover-types';
import { useDiscoverInfinitePostsQuery } from '@/entities/discover/api/discover-queries';
import { DiscoverControls } from '@/features/discover-filter/ui/discover-controls';
import { buildMediaUrl } from '@/shared/api/media';
import { buildCommunityAuthorLabel } from '@/shared/lib/student';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { TreeholeAvatar } from '@/shared/ui/treehole-avatar';

interface DiscoverFeedProps {
  categories: readonly DiscoverCategory[];
  sort: DiscoverSort;
  category: DiscoverCategory | 'all';
  onSortChange: (sort: DiscoverSort) => void;
  onCategoryChange: (category: DiscoverCategory | 'all') => void;
  onRefreshClick: () => void;
  refreshing?: boolean;
  onOpenPost: (postId: number) => void;
  onComposeClick: () => void;
}

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function DiscoverSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index} className="overflow-hidden p-0">
          <div className="aspect-[4/3] animate-pulse bg-shell-strong sm:aspect-[16/10]" />
          <div className="space-y-3 p-4">
            <div className="h-5 w-2/3 animate-pulse rounded bg-shell-strong" />
            <div className="h-4 w-full animate-pulse rounded bg-shell-strong" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function DiscoverFeed({
  categories,
  sort,
  category,
  onSortChange,
  onCategoryChange,
  onRefreshClick,
  refreshing = false,
  onOpenPost,
  onComposeClick,
}: DiscoverFeedProps) {
  const postsQuery = useDiscoverInfinitePostsQuery({
    sort,
    category: category === 'all' ? undefined : category,
    pageSize: 12,
  });
  const posts = postsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-4">
      <DiscoverControls
        categories={categories}
        category={category}
        refreshing={refreshing}
        sort={sort}
        onCategoryChange={onCategoryChange}
        onComposeClick={onComposeClick}
        onRefreshClick={onRefreshClick}
        onSortChange={onSortChange}
      />

      {postsQuery.isLoading ? <DiscoverSkeleton /> : null}

      {postsQuery.isError ? (
        <Card className="space-y-3">
          <p className="text-sm text-error">加载失败，请重试</p>
          <Button size="sm" type="button" variant="secondary" onClick={() => void postsQuery.refetch()}>重试</Button>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError && posts.length === 0 ? (
        <Card className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">暂无推荐</p>
          <Button size="sm" type="button" onClick={onComposeClick}>
            <Plus aria-hidden="true" className="size-4" />
            发布
          </Button>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError && posts.length > 0 ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <button
              key={post.id}
              className="feed-card-trigger"
              style={{ contentVisibility: 'auto', containIntrinsicSize: '420px' }}
              type="button"
              onClick={() => onOpenPost(post.id)}
            >
              <Card className="overflow-hidden p-0 transition-colors hover:border-[#d4d4d4]">
                {post.coverUrl ? (
                  <img
                    alt={post.title || '推荐图片'}
                    className="aspect-[4/3] w-full object-cover sm:aspect-[16/10]"
                    loading="lazy"
                    src={buildMediaUrl(post.coverUrl)}
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-tint-soft text-muted sm:aspect-[16/10]">
                    <Image aria-hidden="true" className="size-6" />
                  </div>
                )}

                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-clamp-2 break-words text-base font-semibold leading-6">{post.title || post.category}</h2>
                      <p className="mt-1 truncate text-sm text-muted">
                        {[post.category, post.storeName].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {post.priceText ? <span className="shrink-0 text-sm font-medium">{post.priceText}</span> : null}
                  </div>

                  <p className="text-clamp-2 break-words text-sm leading-6 text-muted">{post.content}</p>

                  <div className="flex items-center justify-between gap-3 text-xs text-muted">
                    <span className="flex min-w-0 items-center gap-2">
                      <TreeholeAvatar className="size-5 rounded-full text-[0.6rem]" fallbackLabel={null} src={post.avatarUrl} />
                      <span className="truncate">{buildCommunityAuthorLabel(post.author.nickname, post.author.label)} · {formatPublishedAt(post.publishedAt)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="inline-flex items-center gap-1"><Star aria-hidden="true" className="size-3.5" />{post.rating.average.toFixed(1)}</span>
                      <span className="inline-flex items-center gap-1"><MessageCircle aria-hidden="true" className="size-3.5" />{post.commentCount}</span>
                    </span>
                  </div>
                </div>
              </Card>
            </button>
          ))}

          {postsQuery.hasNextPage ? (
            <div className="flex justify-center pt-1">
              <Button disabled={postsQuery.isFetchingNextPage} size="sm" type="button" variant="secondary" onClick={() => void postsQuery.fetchNextPage()}>
                {postsQuery.isFetchingNextPage ? '加载中…' : '加载更多'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
