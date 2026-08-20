/**
 * [INPUT]: 依赖 Treehole 无限列表/幂等点赞、首图私有媒体、共享计数互动原语、全局反馈及发布/详情/作者/分享动作
 * [OUTPUT]: 对外提供 TreeholeFeed，以 Instagram 图文帖与 X 文字帖双布局呈现支持作者自赞的同一时间线
 * [POS]: widgets/treehole-feed 的首页信息流容器，只挂载每篇图文帖首图并保留服务端互动事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Heart, MessageCircle, Plus, Share2 } from 'lucide-react';
import { useToastStore } from '@/app/state/toast-store';
import {
  useLikeTreeholePostMutation,
  useTreeholeInfinitePostsQuery,
  useUnlikeTreeholePostMutation,
} from '@/entities/treehole/api/treehole-queries';
import type { TreeholePost } from '@/entities/treehole/model/treehole-types';
import { TreeholePrimaryMedia } from '@/entities/treehole/ui/treehole-post-media';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
import { SocialCountAction } from '@/shared/ui/social-count-action';

const FEED_SURFACE_CLASS = 'rounded-none border-x-0 border-y-0 border-[#dbdbdb] shadow-none';

interface TreeholeFeedProps {
  onComposeClick: () => void;
  onOpenPost: (postId: number) => void;
  onOpenProfile: (userId: number) => void;
  onSharePost: (post: TreeholePost) => void;
}

interface PostCardProps {
  post: TreeholePost;
  eagerMedia?: boolean;
  likePending: boolean;
  onOpenPost: (postId: number) => void;
  onOpenProfile: (userId: number) => void;
  onSharePost: (post: TreeholePost) => void;
  onToggleLike: (post: TreeholePost) => void;
}

interface InstagramActionRowProps {
  post: TreeholePost;
  likePending: boolean;
  onOpenPost: (postId: number) => void;
  onSharePost: (post: TreeholePost) => void;
  onToggleLike: (post: TreeholePost) => void;
}

function formatPublishedAt(value: string) {
  const publishedAt = new Date(value);
  const elapsedMs = Date.now() - publishedAt.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return publishedAt.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return '刚刚';
  if (elapsedMinutes < 60) return `${elapsedMinutes}分钟`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}小时`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}天`;
  return publishedAt.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function InstagramActionRow({
  post,
  likePending,
  onOpenPost,
  onSharePost,
  onToggleLike,
}: InstagramActionRowProps) {
  return (
    <div className="flex items-center gap-4 px-4 pt-3.5 sm:px-5">
      <SocialCountAction
        active={post.viewer.liked}
        aria-label={post.viewer.liked ? '取消点赞' : '点赞'}
        aria-pressed={post.viewer.liked}
        className="-ml-2"
        count={post.stats.likeCount}
        disabled={likePending}
        icon={<Heart aria-hidden="true" className="size-6" fill={post.viewer.liked ? 'currentColor' : 'none'} strokeWidth={1.9} />}
        onClick={() => onToggleLike(post)}
      />
      <SocialCountAction
        aria-label={`查看 ${post.stats.commentCount} 条评论`}
        count={post.stats.commentCount}
        icon={<MessageCircle aria-hidden="true" className="size-6" strokeWidth={1.9} />}
        onClick={() => onOpenPost(post.id)}
      />
      <button
        aria-label="分享帖子"
        className="grid size-10 place-items-center rounded-full transition-opacity hover:opacity-60"
        type="button"
        onClick={() => onSharePost(post)}
      >
        <Share2 aria-hidden="true" className="size-6" strokeWidth={1.9} />
      </button>
    </div>
  );
}

function ImagePostCard({
  post,
  eagerMedia = false,
  likePending,
  onOpenPost,
  onOpenProfile,
  onSharePost,
  onToggleLike,
}: PostCardProps) {
  const primaryImage = post.images[0];
  const showExpand = Array.from(post.content).length > 48 || post.content.split('\n').length > 2;

  return (
    <article
      className="border-b border-[#dbdbdb] bg-white pb-1 last:border-b-0"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 680px' }}
    >
      <header className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <button
          className="flex min-w-0 items-center gap-3 rounded-[0.5rem] text-left transition-opacity hover:opacity-70"
          type="button"
          onClick={() => onOpenProfile(post.author.id)}
        >
          <CommunityAvatar
            alt={`${post.author.displayName} 的头像`}
            className="size-[42px] text-sm"
            fallbackLabel={Array.from(post.author.displayName)[0] ?? '同'}
            src={post.author.avatarUrl}
          />
          <span className="flex min-w-0 items-baseline gap-1.5">
            <strong className="truncate text-sm font-bold">{post.author.displayName}</strong>
            <span aria-hidden="true" className="text-sm text-muted">·</span>
            <time className="shrink-0 text-sm text-muted">{formatPublishedAt(post.publishedAt)}</time>
          </span>
        </button>
      </header>

      {primaryImage ? (
        <TreeholePrimaryMedia
          alt={`${post.author.displayName} 发布的图片`}
          eager={eagerMedia}
          image={primaryImage}
          imageCount={post.imageCount}
          onOpen={() => onOpenPost(post.id)}
        />
      ) : null}

      <InstagramActionRow
        likePending={likePending}
        post={post}
        onOpenPost={onOpenPost}
        onSharePost={onSharePost}
        onToggleLike={onToggleLike}
      />

      <div className="px-4 pb-4 pt-1 sm:px-5">
        <button className="block w-full text-left" type="button" onClick={() => onOpenPost(post.id)}>
          <span className="text-clamp-2 block break-words text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{post.content}</span>
        </button>
        {showExpand ? (
          <button className="mt-1 text-sm text-muted hover:text-ink" type="button" onClick={() => onOpenPost(post.id)}>展开</button>
        ) : null}
      </div>
    </article>
  );
}

function TextPostCard({
  post,
  likePending,
  onOpenPost,
  onOpenProfile,
  onSharePost,
  onToggleLike,
}: PostCardProps) {
  return (
    <article
      className="border-b border-[#dbdbdb] bg-white pb-1 last:border-b-0"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 220px' }}
    >
      <header className="flex items-center gap-3 px-4 pt-4 sm:px-5">
        <button className="h-fit shrink-0 rounded-full transition-opacity hover:opacity-70" type="button" onClick={() => onOpenProfile(post.author.id)}>
          <CommunityAvatar
            alt={`${post.author.displayName} 的头像`}
            className="size-11 text-sm"
            fallbackLabel={Array.from(post.author.displayName)[0] ?? '同'}
            src={post.author.avatarUrl}
          />
        </button>
        <button className="flex min-w-0 items-baseline gap-1.5 text-left" type="button" onClick={() => onOpenProfile(post.author.id)}>
          <strong className="truncate text-[0.9375rem] font-bold">{post.author.displayName}</strong>
          <span aria-hidden="true" className="text-sm text-muted">·</span>
          <time className="shrink-0 text-sm text-muted">{formatPublishedAt(post.publishedAt)}</time>
        </button>
      </header>

      <button className="mt-3 block w-full px-4 text-left sm:px-5" type="button" onClick={() => onOpenPost(post.id)}>
        <span className="block break-words text-[0.98rem] leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">{post.content}</span>
      </button>

      <InstagramActionRow
        likePending={likePending}
        post={post}
        onOpenPost={onOpenPost}
        onSharePost={onSharePost}
        onToggleLike={onToggleLike}
      />
    </article>
  );
}

function TreeholeSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="border-b border-[#dbdbdb] bg-white">
        <div className="flex items-center gap-3 px-4 py-3"><div className="size-[42px] animate-pulse rounded-full bg-shell-strong" /><div className="space-y-2"><div className="h-4 w-24 animate-pulse rounded bg-shell-strong" /><div className="h-3 w-16 animate-pulse rounded bg-shell-strong" /></div></div>
        <div className="aspect-[4/5] animate-pulse bg-shell-strong" />
        <div className="space-y-3 px-4 py-4"><div className="h-6 w-32 animate-pulse rounded bg-shell-strong" /><div className="h-10 animate-pulse rounded bg-shell-strong" /></div>
      </div>
      <div className="border-b border-[#dbdbdb] px-4 py-4">
        <div className="flex items-center gap-3"><div className="size-11 animate-pulse rounded-full bg-shell-strong" /><div className="h-4 w-32 animate-pulse rounded bg-shell-strong" /></div>
        <div className="mt-3 h-20 animate-pulse rounded bg-shell-strong" />
        <div className="mt-3 h-5 w-48 animate-pulse rounded bg-shell-strong" />
      </div>
    </div>
  );
}

export function TreeholeFeed({ onComposeClick, onOpenPost, onOpenProfile, onSharePost }: TreeholeFeedProps) {
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
      if (post.viewer.liked) await unlikeMutation.mutateAsync({ postId: post.id });
      else await likeMutation.mutateAsync({ postId: post.id });
    } catch (error) {
      pushToast({
        title: '点赞失败',
        message: error instanceof Error ? error.message : '请稍后重试',
        variant: 'error',
      });
    }
  };

  return (
    <div>
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
          <Button size="sm" type="button" onClick={onComposeClick}><Plus aria-hidden="true" className="size-4" />发布</Button>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError && posts.length > 0 ? (
        <Card className={cn(FEED_SURFACE_CLASS, 'overflow-hidden p-0')}>
          {posts.map((post, postIndex) => {
            const cardProps: PostCardProps = {
              post,
              eagerMedia: postIndex === 0,
              likePending: pendingPostId === post.id,
              onOpenPost,
              onOpenProfile,
              onSharePost,
              onToggleLike: (nextPost) => void handleToggleLike(nextPost),
            };
            return post.images.length > 0
              ? <ImagePostCard key={post.id} {...cardProps} />
              : <TextPostCard key={post.id} {...cardProps} />;
          })}
        </Card>
      ) : null}

      {postsQuery.hasNextPage ? (
        <div className="flex justify-center border-t border-[#dbdbdb] px-4 py-4">
          <Button disabled={postsQuery.isFetchingNextPage} size="sm" type="button" variant="secondary" onClick={() => void postsQuery.fetchNextPage()}>
            {postsQuery.isFetchingNextPage ? '加载中…' : '加载更多'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
