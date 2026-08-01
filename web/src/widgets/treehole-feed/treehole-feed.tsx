/**
 * [INPUT]: 依赖 Treehole 无限列表与幂等点赞 mutation、全局瞬时反馈、社区头像及发布/详情/作者资料动作
 * [OUTPUT]: 对外提供 TreeholeFeed，以分隔信息流呈现作者、正文及可执行的点赞与评论入口
 * [POS]: widgets/treehole-feed 的交互信息流容器，编排列表分页和轻量帖子动作，不承载详情评论线程
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Heart, MessageCircle, Plus } from 'lucide-react';
import { useToastStore } from '@/app/state/toast-store';
import {
  useLikeTreeholePostMutation,
  useTreeholeInfinitePostsQuery,
  useUnlikeTreeholePostMutation,
} from '@/entities/treehole/api/treehole-queries';
import type { TreeholePost } from '@/entities/treehole/model/treehole-types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
import { cn } from '@/shared/lib/cn';

const FEED_SURFACE_CLASS = 'rounded-none border-x-0 border-b-0 border-[#dbdbdb] shadow-none';

interface TreeholeFeedProps {
  onComposeClick: () => void;
  onOpenPost: (postId: number) => void;
  onOpenProfile: (userId: number) => void;
}

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function TreeholeSkeleton() {
  return (
    <Card className={cn(FEED_SURFACE_CLASS, 'divide-y divide-[#dbdbdb] overflow-hidden p-0')} aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-5 px-4 py-5 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="size-11 animate-pulse rounded-full bg-shell-strong" />
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-shell-strong" />
              <div className="h-3 w-20 animate-pulse rounded bg-shell-strong" />
            </div>
          </div>
          <div className="h-16 animate-pulse rounded bg-shell-strong" />
          <div className="h-6 w-28 animate-pulse rounded bg-shell-strong" />
        </div>
      ))}
    </Card>
  );
}

export function TreeholeFeed({ onComposeClick, onOpenPost, onOpenProfile }: TreeholeFeedProps) {
  const pushToast = useToastStore((state) => state.pushToast);
  const postsQuery = useTreeholeInfinitePostsQuery({ pageSize: 12 });
  const likeMutation = useLikeTreeholePostMutation();
  const unlikeMutation = useUnlikeTreeholePostMutation();
  const posts = postsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const likeBusy = likeMutation.isPending || unlikeMutation.isPending;
  const pendingPostId = likeMutation.isPending
    ? likeMutation.variables?.postId
    : unlikeMutation.isPending
      ? unlikeMutation.variables?.postId
      : null;

  const handleToggleLike = async (post: TreeholePost) => {
    if (likeBusy) return;

    try {
      if (post.viewer.liked) {
        await unlikeMutation.mutateAsync({ postId: post.id });
      } else {
        await likeMutation.mutateAsync({ postId: post.id });
      }
    } catch (error) {
      pushToast({
        title: '点赞失败',
        message: error instanceof Error ? error.message : '请稍后重试',
        variant: 'error',
      });
    }
  };

  return (
    <div className="space-y-3">
      {postsQuery.isLoading ? <TreeholeSkeleton /> : null}

      {postsQuery.isError ? (
        <Card className={cn(FEED_SURFACE_CLASS, 'space-y-3')}>
          <p className="text-sm text-error">加载失败，请重试</p>
          <Button size="sm" type="button" variant="secondary" onClick={() => void postsQuery.refetch()}>重试</Button>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError && posts.length === 0 ? (
        <Card className={cn(FEED_SURFACE_CLASS, 'flex items-center justify-between gap-3')}>
          <p className="text-sm text-muted">暂无动态</p>
          <Button size="sm" type="button" onClick={onComposeClick}>
            <Plus aria-hidden="true" className="size-4" />
            发布
          </Button>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError && posts.length > 0 ? (
        <Card className={cn(FEED_SURFACE_CLASS, 'divide-y divide-[#dbdbdb] overflow-hidden p-0')}>
          {posts.map((post) => (
            <article
              key={post.id}
              className="px-4 py-5 sm:px-5"
              style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 230px' }}
            >
              <button
                aria-label={`查看 ${post.author.displayName} 的个人主页`}
                className="flex max-w-full items-center gap-3 rounded-[0.5rem] text-left transition-opacity hover:opacity-70"
                type="button"
                onClick={() => onOpenProfile(post.author.id)}
              >
                <CommunityAvatar
                  alt={`${post.author.displayName} 的头像`}
                  className="size-11 text-sm"
                  fallbackLabel={post.author.displayName.slice(0, 1)}
                  src={post.author.avatarUrl}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[0.9375rem] font-semibold">{post.author.displayName}</span>
                  <span className="mt-0.5 block text-xs text-muted">{formatPublishedAt(post.publishedAt)}</span>
                </span>
              </button>

              <button
                aria-label={`打开 ${post.author.displayName} 的树洞`}
                className="mt-4 block w-full rounded-[0.375rem] text-left"
                type="button"
                onClick={() => onOpenPost(post.id)}
              >
                <p className="text-clamp-4 break-words text-base leading-7 whitespace-pre-wrap">{post.content}</p>
              </button>

              <div className="mt-4 flex items-center gap-5 text-[0.9375rem] font-semibold text-ink">
                <button
                  aria-label={post.viewer.liked ? '取消点赞' : '点赞'}
                  aria-pressed={post.viewer.liked}
                  aria-busy={pendingPostId === post.id}
                  className="inline-flex min-h-9 items-center gap-2 rounded-[0.375rem] px-1 transition-opacity hover:opacity-65 disabled:cursor-wait disabled:opacity-50"
                  disabled={likeBusy}
                  type="button"
                  onClick={() => void handleToggleLike(post)}
                >
                  <Heart
                    aria-hidden="true"
                    className={cn('size-6', post.viewer.liked ? 'text-error' : 'text-ink')}
                    fill={post.viewer.liked ? 'currentColor' : 'none'}
                    strokeWidth={2}
                  />
                  <span>{post.stats.likeCount.toLocaleString('zh-CN')}</span>
                </button>
                <button
                  aria-label={`查看 ${post.stats.commentCount} 条评论`}
                  className="inline-flex min-h-9 items-center gap-2 rounded-[0.375rem] px-1 text-ink transition-opacity hover:opacity-65"
                  type="button"
                  onClick={() => onOpenPost(post.id)}
                >
                  <MessageCircle aria-hidden="true" className="size-6" strokeWidth={2} />
                  <span>{post.stats.commentCount.toLocaleString('zh-CN')}</span>
                </button>
              </div>
            </article>
          ))}
        </Card>
      ) : null}

      {postsQuery.hasNextPage ? (
        <div className="flex justify-center pt-1">
          <Button disabled={postsQuery.isFetchingNextPage} size="sm" type="button" variant="secondary" onClick={() => void postsQuery.fetchNextPage()}>
            {postsQuery.isFetchingNextPage ? '加载中…' : '加载更多'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
