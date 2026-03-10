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

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

  return (
    <div className="space-y-4">
      <DiscoverControls
        categories={categories}
        category={category}
        sort={sort}
        onCategoryChange={onCategoryChange}
        onSortChange={onSortChange}
      />

      {postsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Card key={index} className="space-y-3">
              <div className="aspect-[16/10] animate-pulse rounded-[1.15rem] bg-shell-strong" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-shell-strong" />
              <div className="h-4 w-full animate-pulse rounded bg-shell-strong" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-shell-strong" />
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
            这一栏暂时还很安静。先发一顿，把档口、价格和推荐理由说清楚。
          </p>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <button
              key={post.id}
              className="block w-full text-left active:scale-[0.995]"
              type="button"
              onClick={() => onOpenPost(post.id)}
            >
              <Card className="overflow-hidden p-0 transition hover:-translate-y-0.5 hover:bg-card-strong">
                <div className="grid gap-0 sm:grid-cols-[15rem_minmax(0,1fr)]">
                  <div className="relative overflow-hidden sm:min-h-full">
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
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent p-3 text-white sm:hidden">
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

                  <div className="space-y-3 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="hidden rounded-pill bg-tint-soft px-3 py-1 text-xs font-medium text-[#7e3925] sm:inline-flex">
                        {post.category}
                      </span>
                      {post.storeName ? (
                        <span className="rounded-pill bg-white/85 px-3 py-1 text-xs text-muted ring-1 ring-line">
                          {post.storeName}
                        </span>
                      ) : null}
                      {post.priceText ? (
                        <span className="rounded-pill bg-white/85 px-3 py-1 text-xs text-muted ring-1 ring-line">
                          {post.priceText}
                        </span>
                      ) : null}
                      {post.isMine ? (
                        <span className="rounded-pill bg-white/85 px-3 py-1 text-xs text-muted ring-1 ring-line">
                          我的
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-[1.08rem] font-semibold tracking-[-0.04em] text-ink sm:text-xl">
                        {post.title || `${post.category} · 同学推荐`}
                      </h3>
                      <p className="text-clamp-3 text-sm leading-6 text-muted sm:leading-7">
                        {post.content || '这条旧帖子还没有正文说明。'}
                      </p>
                    </div>

                    {post.tags.length > 0 ? (
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
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-2.5 text-[0.82rem] text-muted sm:text-sm">
                      <span>{buildClassmateLabel(post.author.label)} · {formatPublishedAt(post.publishedAt)}</span>
                      <span>
                        {post.rating.average.toFixed(1)} 分 · {post.rating.count} 人 · {post.imageCount} 张图
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </button>
          ))}

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-sm text-muted">
              {total > 0 ? `已展示 ${posts.length} / ${total}` : '正在整理内容'}
            </div>
            <Button
              className="min-w-[6rem]"
              size="sm"
              type="button"
              variant="subtle"
              onClick={() => void postsQuery.refetch()}
            >
              {postsQuery.isRefetching ? '刷新中...' : '刷新列表'}
            </Button>
            {postsQuery.hasNextPage ? (
              <Button
                className="min-w-[6rem]"
                size="sm"
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
