import { Add20Filled } from '@fluentui/react-icons/svg/add';
import { Chat20Filled } from '@fluentui/react-icons/svg/chat';
import { Comment20Filled } from '@fluentui/react-icons/svg/comment';
import { Heart20Filled } from '@fluentui/react-icons/svg/heart';
import { TextQuote20Filled } from '@fluentui/react-icons/svg/text-quote';
import { useTreeholeInfinitePostsQuery } from '@/entities/treehole/api/treehole-queries';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconBubble } from '@/shared/ui/page-ornament';
import { TreeholeAvatar } from '@/shared/ui/treehole-avatar';

interface TreeholeFeedProps {
  onComposeClick: () => void;
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

export function TreeholeFeed({ onComposeClick, onOpenPost }: TreeholeFeedProps) {
  const postsQuery = useTreeholeInfinitePostsQuery({ pageSize: 12 });
  const posts = postsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = postsQuery.data?.pages[0]?.total ?? 0;

  return (
    <div className="space-y-4">
      {postsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Card key={index} className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="size-10 animate-pulse rounded-[0.8rem] bg-shell-strong" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="h-5 w-24 animate-pulse rounded bg-shell-strong" />
                  <div className="h-20 animate-pulse rounded-[1.15rem] bg-shell-strong" />
                  <div className="h-4 w-32 animate-pulse rounded bg-shell-strong" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {postsQuery.isError ? (
        <Card className="space-y-3 overflow-hidden bg-card-strong">
          <div className="flex items-start gap-3.5">
            <IconBubble
              icon={<Chat20Filled aria-hidden="true" className="size-5" />}
              tone="blue"
            />
            <div className="space-y-1">
              <p className="text-base font-semibold text-ink">树洞加载失败</p>
              <p className="text-sm leading-6 text-muted">
                {postsQuery.error instanceof Error ? postsQuery.error.message : '列表请求失败'}
              </p>
            </div>
          </div>
          <Button size="sm" type="button" variant="secondary" onClick={() => void postsQuery.refetch()}>
            重试
          </Button>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError && posts.length === 0 ? (
        <Card className="relative overflow-hidden bg-card-strong p-5">
          <div className="pointer-events-none absolute -right-10 top-1/2 hidden size-28 -translate-y-1/2 rounded-full bg-[#c7d8fb]/68 blur-3xl sm:block" />
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.36))] sm:block" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <div className="flex items-start gap-3.5">
                <IconBubble
                  icon={<Chat20Filled aria-hidden="true" className="size-5" />}
                  size="lg"
                  tone="blue"
                />
                <div className="space-y-1.5">
                  <p className="text-base font-semibold text-ink">还没有内容</p>
                  <p className="max-w-[18rem] text-sm leading-6 text-muted">
                    发一条匿名发言，树洞就不会这么安静。
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/78 px-3 py-1.5 text-[0.78rem] font-medium text-muted ring-1 ring-line">
                  <TextQuote20Filled aria-hidden="true" className="size-4" />
                  匿名
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/78 px-3 py-1.5 text-[0.78rem] font-medium text-muted ring-1 ring-line">
                  <Comment20Filled aria-hidden="true" className="size-4" />
                  评论
                </span>
              </div>
            </div>

            <Button className="w-full sm:w-auto" size="sm" type="button" variant="secondary" onClick={onComposeClick}>
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
              <Card className="space-y-4 shadow-none transition motion-reduce:transition-none sm:hover:-translate-y-0.5 sm:hover:bg-card-strong">
                <div className="flex items-start gap-3">
                  <TreeholeAvatar src={post.avatarUrl} />
                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-pill bg-tint-soft px-3 py-1 text-xs font-medium text-ink">
                          匿名树洞
                        </span>
                        {post.viewer.isMine ? (
                          <span className="rounded-pill bg-white px-3 py-1 text-xs text-muted ring-1 ring-line">
                            我的
                          </span>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs text-muted">{formatPublishedAt(post.publishedAt)}</span>
                    </div>

                    <p className="text-clamp-4 text-sm leading-7 whitespace-pre-wrap text-ink">
                      {post.content}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Heart20Filled aria-hidden="true" className="size-4" />
                        {post.stats.likeCount} 个赞
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Comment20Filled aria-hidden="true" className="size-4" />
                        {post.stats.commentCount} 条评论
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </button>
          ))}

          <div className="glass-panel flex flex-col gap-3 rounded-[1.5rem] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
            <IconBubble
              icon={<TextQuote20Filled aria-hidden="true" className="size-4" />}
              size="sm"
              tone="blue"
            />
            <div className="text-sm text-muted">
              {total > 0 ? `已展示 ${posts.length} / ${total}` : '暂无内容'}
            </div>
            <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Button
                className="w-full sm:min-w-[6rem] sm:w-auto"
                size="sm"
                type="button"
                variant="subtle"
                onClick={() => void postsQuery.refetch()}
              >
                {postsQuery.isRefetching ? '刷新中...' : '刷新'}
              </Button>
              {postsQuery.hasNextPage ? (
                <Button
                  className="w-full sm:min-w-[6rem] sm:w-auto"
                  disabled={postsQuery.isFetchingNextPage}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => void postsQuery.fetchNextPage()}
                >
                  {postsQuery.isFetchingNextPage ? '加载中...' : '加载更多'}
                </Button>
              ) : posts.length > 0 ? (
                <span className="text-sm text-muted">已经到底了</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
