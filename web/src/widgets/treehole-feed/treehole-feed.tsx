/**
 * [INPUT]: 依赖 Treehole 无限列表查询、社区头像与发布/详情动作
 * [OUTPUT]: 对外提供 TreeholeFeed，以文字优先的信息层级呈现树洞动态
 * [POS]: widgets/treehole-feed 的只读信息流容器，只负责状态、列表与分页
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Heart, MessageCircle, Plus } from 'lucide-react';
import { useTreeholeInfinitePostsQuery } from '@/entities/treehole/api/treehole-queries';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { TreeholeAvatar } from '@/shared/ui/treehole-avatar';

interface TreeholeFeedProps {
  onComposeClick: () => void;
  onOpenPost: (postId: number) => void;
}

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function TreeholeSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="space-y-4">
          <div className="flex items-center gap-3"><div className="size-8 animate-pulse rounded-full bg-shell-strong" /><div className="h-4 w-24 animate-pulse rounded bg-shell-strong" /></div>
          <div className="h-20 animate-pulse rounded bg-shell-strong" />
        </Card>
      ))}
    </div>
  );
}

export function TreeholeFeed({ onComposeClick, onOpenPost }: TreeholeFeedProps) {
  const postsQuery = useTreeholeInfinitePostsQuery({ pageSize: 12 });
  const posts = postsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-3">
      {postsQuery.isLoading ? <TreeholeSkeleton /> : null}

      {postsQuery.isError ? (
        <Card className="space-y-3">
          <p className="text-sm text-error">加载失败，请重试</p>
          <Button size="sm" type="button" variant="secondary" onClick={() => void postsQuery.refetch()}>重试</Button>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError && posts.length === 0 ? (
        <Card className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">暂无动态</p>
          <Button size="sm" type="button" onClick={onComposeClick}>
            <Plus aria-hidden="true" className="size-4" />
            发布
          </Button>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError ? posts.map((post) => (
        <button
          key={post.id}
          className="feed-card-trigger"
          style={{ contentVisibility: 'auto', containIntrinsicSize: '220px' }}
          type="button"
          onClick={() => onOpenPost(post.id)}
        >
          <Card className="space-y-4 transition-colors hover:border-[#d4d4d4]">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <TreeholeAvatar className="size-8 rounded-full text-[0.65rem]" src={post.avatarUrl} />
                <span className="truncate text-sm font-medium">{post.nickname || '匿名用户'}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{formatPublishedAt(post.publishedAt)}</span>
            </div>
            <p className="text-clamp-4 break-words text-[0.9375rem] leading-7 whitespace-pre-wrap">{post.content}</p>
            <div className="flex items-center gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><Heart aria-hidden="true" className="size-4" />{post.stats.likeCount}</span>
              <span className="inline-flex items-center gap-1.5"><MessageCircle aria-hidden="true" className="size-4" />{post.stats.commentCount}</span>
            </div>
          </Card>
        </button>
      )) : null}

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
