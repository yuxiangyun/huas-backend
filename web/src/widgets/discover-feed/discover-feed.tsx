import { Add20Filled } from '@fluentui/react-icons/svg/add';
import { Apps20Filled } from '@fluentui/react-icons/svg/apps';
import { ArrowTrendingSparkle20Filled } from '@fluentui/react-icons/svg/arrow-trending-sparkle';
import { BowlChopsticks20Filled } from '@fluentui/react-icons/svg/bowl-chopsticks';
import { BowlSalad24Filled } from '@fluentui/react-icons/svg/bowl-salad';
import { Star20Filled } from '@fluentui/react-icons/svg/star';
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
import { IconBubble } from '@/shared/ui/page-ornament';

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
  const total = postsQuery.data?.pages[0]?.total ?? 0;

  return (
    <div className="space-y-4">
      <DiscoverControls
        categories={categories}
        category={category}
        sort={sort}
        onComposeClick={onComposeClick}
        onCategoryChange={onCategoryChange}
        onRefreshClick={onRefreshClick}
        refreshing={refreshing}
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
        <Card className="space-y-3 overflow-hidden bg-card-strong">
          <div className="flex items-start gap-3.5">
            <IconBubble
              icon={<Apps20Filled aria-hidden="true" className="size-5" />}
              tone="blue"
            />
            <div className="space-y-1">
              <p className="text-base font-semibold text-ink">加载失败</p>
              <p className="text-sm leading-6 text-muted">
                {postsQuery.error instanceof Error ? postsQuery.error.message : '列表请求失败'}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError && posts.length === 0 ? (
        <Card className="relative overflow-hidden bg-card-strong p-5">
          <div className="pointer-events-none absolute -right-10 top-1/2 hidden size-28 -translate-y-1/2 rounded-full bg-[#f4d49b]/64 blur-3xl sm:block" />
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.36))] sm:block" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <div className="flex items-start gap-3.5">
                <IconBubble
                  icon={<BowlChopsticks20Filled aria-hidden="true" className="size-5" />}
                  size="lg"
                  tone="amber"
                />
                <div className="space-y-1.5">
                  <p className="text-base font-semibold text-ink">还没有内容</p>
                  <p className="max-w-[18rem] text-sm leading-6 text-muted">
                    先发一条，把今天吃到的告诉大家。
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/78 px-3 py-1.5 text-[0.78rem] font-medium text-muted ring-1 ring-line">
                  <ArrowTrendingSparkle20Filled aria-hidden="true" className="size-4" />
                  推荐
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/78 px-3 py-1.5 text-[0.78rem] font-medium text-muted ring-1 ring-line">
                  <Apps20Filled aria-hidden="true" className="size-4" />
                  分类
                </span>
              </div>
            </div>

            <Button
              className="w-full sm:min-w-[7rem] sm:w-auto"
              size="sm"
              type="button"
              variant="secondary"
              onClick={onComposeClick}
            >
              <Add20Filled aria-hidden="true" className="size-4" />
              发第一条
            </Button>
          </div>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <button
              key={post.id}
              className="mobile-feed-item block w-full text-left active:scale-[0.995] motion-reduce:transform-none"
              type="button"
              onClick={() => onOpenPost(post.id)}
            >
              <Card className="overflow-hidden p-0 transition motion-reduce:transition-none sm:hover:-translate-y-0.5 sm:hover:bg-card-strong">
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
                      <div className="flex aspect-[16/10] items-center justify-center bg-[linear-gradient(145deg,#f4f6f8,#dfe5eb)] sm:aspect-[4/3]">
                        <IconBubble
                          icon={<BowlSalad24Filled aria-hidden="true" className="size-7" />}
                          size="lg"
                          tone="amber"
                        />
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent p-3 text-white sm:hidden">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-pill bg-white/18 px-3 py-1 text-xs font-medium sm:backdrop-blur-md">
                          {post.category}
                        </span>
                        {post.isMine ? (
                          <span className="rounded-pill bg-white/18 px-3 py-1 text-xs font-medium sm:backdrop-blur-md">
                            我的
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="hidden rounded-pill bg-tint-soft px-3 py-1 text-xs font-medium text-ink sm:inline-flex">
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
                        {post.content || '未填写'}
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

                    <div className="flex flex-col items-start gap-1.5 text-[0.82rem] text-muted sm:flex-row sm:items-center sm:justify-between sm:text-sm">
                      <span>{buildClassmateLabel(post.author.label)} · {formatPublishedAt(post.publishedAt)}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <Star20Filled aria-hidden="true" className="size-4" />
                        {post.rating.average.toFixed(1)} 分 · {post.rating.count} 人 · {post.imageCount} 张图
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </button>
          ))}

          <div className="glass-panel flex flex-col gap-3 rounded-[1.5rem] px-4 py-3 sm:flex-row sm:items-center">
            <IconBubble
              icon={<Apps20Filled aria-hidden="true" className="size-4" />}
              size="sm"
              tone="slate"
            />
            <div className="min-w-0 space-y-1">
              <p className="text-[0.8rem] font-medium tracking-[0.12em] text-muted">
                列表
              </p>
              <p className="text-sm text-muted">
                {total > 0 ? `已展示 ${posts.length} / ${total}` : '暂无内容'}
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
              {postsQuery.hasNextPage ? (
                <Button
                  className="w-full sm:min-w-[6.25rem] sm:w-auto"
                  size="sm"
                  type="button"
                  variant="secondary"
                  disabled={postsQuery.isFetchingNextPage}
                  onClick={() => void postsQuery.fetchNextPage()}
                >
                  {postsQuery.isFetchingNextPage ? '加载中...' : '继续看'}
                </Button>
              ) : posts.length > 0 ? (
                <span className="rounded-pill bg-white/82 px-3 py-2 text-xs font-medium text-muted ring-1 ring-line">
                  已经到底了
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
