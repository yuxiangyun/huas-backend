import type {
  DiscoverCategory,
  DiscoverSort,
} from '@/entities/discover/model/discover-types';
import { useDiscoverInfinitePostsQuery } from '@/entities/discover/api/discover-queries';
import { DiscoverControls } from '@/features/discover-filter/ui/discover-controls';
import { buildMediaUrl } from '@/shared/api/media';
import { buildClassmateLabel } from '@/shared/lib/student';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

interface DiscoverFeedProps {
  categories: readonly DiscoverCategory[];
  sort: DiscoverSort;
  category: DiscoverCategory | 'all';
  onSortChange: (sort: DiscoverSort) => void;
  onCategoryChange: (category: DiscoverCategory | 'all') => void;
  onOpenPost: (postId: number) => void;
}

export function DiscoverFeed({
  categories,
  sort,
  category,
  onSortChange,
  onCategoryChange,
  onOpenPost,
}: DiscoverFeedProps) {
  const postsQuery = useDiscoverInfinitePostsQuery({
    sort,
    category: category === 'all' ? undefined : category,
    pageSize: 12,
  });
  const posts = postsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = postsQuery.data?.pages[0]?.total ?? 0;
  const sortLabelMap: Record<DiscoverSort, string> = {
    latest: '最新',
    score: '高分',
    recommended: '推荐',
  };

  return (
    <div className="space-y-4">
      <DiscoverControls
        categories={categories}
        category={category}
        sort={sort}
        onCategoryChange={onCategoryChange}
        onSortChange={onSortChange}
      />

      <Card className="flex items-start justify-between gap-4 bg-card-strong">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">今日推荐</p>
          <p className="text-sm leading-6 text-muted">
            按分类慢慢逛，也可以切到高分或推荐看看大家最爱的选择。
          </p>
        </div>
        <div className="space-y-2 text-right">
          <span className="inline-flex rounded-pill bg-tint-soft px-3 py-1 text-xs font-medium text-[#7e3925]">
            {sortLabelMap[sort]}
          </span>
          <div className="text-xs text-muted">
            {total > 0 ? `已展示 ${posts.length} / ${total}` : '正在整理内容'}
          </div>
        </div>
      </Card>

      {postsQuery.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Card key={index} className="space-y-4">
              <div className="h-40 animate-pulse rounded-[1.4rem] bg-shell-strong" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-shell-strong" />
              <div className="h-4 w-full animate-pulse rounded bg-shell-strong" />
            </Card>
          ))}
        </div>
      ) : null}

      {postsQuery.isError ? (
        <Card className="space-y-2">
          <p className="text-base font-semibold text-ink">加载失败</p>
          <p className="text-sm leading-6 text-muted">
            {postsQuery.error instanceof Error ? postsQuery.error.message : '列表请求失败'}
          </p>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError && posts.length === 0 ? (
        <Card className="space-y-2">
          <p className="text-base font-semibold text-ink">还没有内容</p>
          <p className="text-sm leading-6 text-muted">
            这一栏暂时还很安静，换个分类看看，或者先来分享你的这一顿。
          </p>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <button
              key={post.id}
              className="block w-full text-left"
              type="button"
              onClick={() => onOpenPost(post.id)}
            >
              <Card className="space-y-4 transition hover:-translate-y-0.5 hover:bg-card-strong">
                <div className="relative overflow-hidden rounded-[1.5rem]">
                  {post.coverUrl ? (
                    <img
                      alt={post.title || '帖子封面'}
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                      src={buildMediaUrl(post.coverUrl)}
                    />
                  ) : (
                    <div className="aspect-[4/3] bg-shell-strong" />
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/35 to-transparent p-4 text-white">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-pill bg-white/18 px-3 py-1 text-xs font-medium backdrop-blur-md">
                        {post.category}
                      </span>
                      {post.isMine ? (
                        <span className="rounded-pill bg-white/18 px-3 py-1 text-xs font-medium backdrop-blur-md">
                          我的
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-pill bg-white/80 px-3 py-1 text-xs text-muted ring-1 ring-line"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <h3 className="text-lg font-semibold text-ink">
                    {post.title || `${post.category} · 同学推荐`}
                  </h3>
                  <p className="text-sm leading-6 text-muted">
                    {buildClassmateLabel(post.author.label)} · {new Date(post.publishedAt).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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

          <div className="flex items-center justify-between gap-3 pt-1">
            <Button
              className="min-w-[6rem]"
              size="md"
              type="button"
              variant="ghost"
              onClick={() => void postsQuery.refetch()}
            >
              {postsQuery.isRefetching ? '刷新中...' : '刷新列表'}
            </Button>
            {postsQuery.hasNextPage ? (
              <Button
                className="min-w-[6rem]"
                size="md"
                type="button"
                variant="secondary"
                disabled={postsQuery.isFetchingNextPage}
                onClick={() => void postsQuery.fetchNextPage()}
              >
                {postsQuery.isFetchingNextPage ? '加载中...' : '加载更多'}
              </Button>
            ) : posts.length > 0 ? (
              <span className="text-sm text-muted">已经到底了</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
