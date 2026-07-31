/**
 * [INPUT]: 依赖 Discover 无限列表/点赞 hooks、筛选控件、媒体 URL 与社区资料投影
 * [OUTPUT]: 对外提供 DiscoverFeed，以首张图片真实比例主图、失效媒体兜底、作者栏、互动栏和精简摘要呈现好饭信息流
 * [POS]: widgets/discover-feed 的单列沉浸式信息流容器，拥有列表内互动但不持有发布和路由状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useEffect, useState } from 'react';
import { Heart, Image, MessageCircle, Plus, Send } from 'lucide-react';
import {
  useDiscoverInfinitePostsQuery,
  useLikeDiscoverPostMutation,
  useUnlikeDiscoverPostMutation,
} from '@/entities/discover/api/discover-queries';
import type { DiscoverCategory, DiscoverPost, DiscoverSort } from '@/entities/discover/model/discover-types';
import { DiscoverControls } from '@/features/discover-filter/ui/discover-controls';
import { useToastStore } from '@/app/state/toast-store';
import { buildMediaUrl } from '@/shared/api/media';
import { ActionMenu } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { CommunityAvatar } from '@/shared/ui/community-avatar';

interface DiscoverFeedProps {
  categories: readonly DiscoverCategory[];
  sort: DiscoverSort;
  category: DiscoverCategory | 'all';
  onSortChange: (sort: DiscoverSort) => void;
  onCategoryChange: (category: DiscoverCategory | 'all') => void;
  onRefreshClick: () => void;
  refreshing?: boolean;
  onOpenPost: (postId: number) => void;
  onOpenProfile: (userId: number) => void;
  onMessageAuthor: (userId: number) => void;
  onComposeClick: () => void;
}

function formatPublishedAt(value: string) {
  const date = new Date(value);
  const day = date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

function postMeta(post: DiscoverPost) {
  return [post.storeName, post.priceText, post.category].filter(Boolean).join(' · ');
}

function primaryImageDisplayWidth(width: number | undefined) {
  if (!width) return '100%';
  return `${Math.min(720, Math.max(280, width))}px`;
}

interface PrimaryImageProps {
  image: DiscoverPost['images'][number] | undefined;
  imageUrl: string;
  alt: string;
  eager: boolean;
}

function PrimaryImage({ image, imageUrl, alt, eager }: PrimaryImageProps) {
  const [failed, setFailed] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setFailed(false);
    setNaturalSize(null);
  }, [imageUrl]);

  if (failed || !imageUrl) {
    return (
      <span className="grid h-48 w-full place-items-center text-muted sm:h-56" aria-label="图片加载失败">
        <Image aria-hidden="true" className="size-8" />
      </span>
    );
  }

  const width = naturalSize?.width || image?.width;
  const height = naturalSize?.height || image?.height;

  return (
    <img
      alt={alt}
      className="h-auto max-h-[min(72dvh,42rem)] max-w-full object-contain"
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
      height={image?.height}
      loading={eager ? 'eager' : 'lazy'}
      src={buildMediaUrl(imageUrl)}
      style={{
        aspectRatio: width && height ? `${width} / ${height}` : undefined,
        width: primaryImageDisplayWidth(width),
      }}
      width={image?.width}
      onError={() => setFailed(true)}
      onLoad={(event) => {
        const { naturalHeight, naturalWidth } = event.currentTarget;
        if (naturalWidth > 0 && naturalHeight > 0) {
          setNaturalSize({ width: naturalWidth, height: naturalHeight });
        }
      }}
    />
  );
}

function DiscoverSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="border-b border-line bg-white">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="size-[42px] animate-pulse rounded-full bg-shell-strong" />
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-shell-strong" />
              <div className="h-3 w-20 animate-pulse rounded bg-shell-strong" />
            </div>
          </div>
          <div className="aspect-[4/5] animate-pulse bg-shell-strong" />
          <div className="space-y-3 px-4 py-4">
            <div className="h-5 w-24 animate-pulse rounded bg-shell-strong" />
            <div className="h-10 w-full animate-pulse rounded bg-shell-strong" />
          </div>
        </div>
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
  onOpenProfile,
  onMessageAuthor,
  onComposeClick,
}: DiscoverFeedProps) {
  const postsQuery = useDiscoverInfinitePostsQuery({
    sort,
    category: category === 'all' ? undefined : category,
    pageSize: 12,
  });
  const likeMutation = useLikeDiscoverPostMutation();
  const unlikeMutation = useUnlikeDiscoverPostMutation();
  const pushToast = useToastStore((state) => state.pushToast);
  const posts = postsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const pendingLikePostId = likeMutation.variables?.postId ?? unlikeMutation.variables?.postId ?? null;

  const toggleLike = async (post: DiscoverPost) => {
    if (post.isMine || pendingLikePostId === post.id) return;
    try {
      if (post.likedByMe) await unlikeMutation.mutateAsync({ postId: post.id });
      else await likeMutation.mutateAsync({ postId: post.id });
    } catch {
      pushToast({ title: '操作失败', message: '请稍后重试', variant: 'error' });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[34rem] overflow-hidden bg-white sm:rounded-[0.875rem] sm:border sm:border-line">
      <DiscoverControls
        categories={categories}
        category={category}
        refreshing={refreshing}
        sort={sort}
        onCategoryChange={onCategoryChange}
        onRefreshClick={onRefreshClick}
        onSortChange={onSortChange}
      />

      {postsQuery.isLoading ? <DiscoverSkeleton /> : null}

      {postsQuery.isError ? (
        <Card className="m-4 space-y-3">
          <p className="text-sm text-error">加载失败，请重试</p>
          <Button size="sm" type="button" variant="secondary" onClick={() => void postsQuery.refetch()}>重试</Button>
        </Card>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError && posts.length === 0 ? (
        <div className="flex items-center justify-between gap-3 px-4 py-16">
          <p className="text-sm text-muted">暂无推荐</p>
          <Button size="sm" type="button" onClick={onComposeClick}>
            <Plus aria-hidden="true" className="size-4" />
            发布
          </Button>
        </div>
      ) : null}

      {!postsQuery.isLoading && !postsQuery.isError ? posts.map((post, postIndex) => {
        const primaryImage = post.images[0];
        const primaryImageUrl = primaryImage?.url || post.coverUrl;
        const authorInitial = Array.from(post.author.displayName)[0] ?? '同';
        const menuItems = [
          { label: '查看个人主页', onSelect: () => onOpenProfile(post.author.id) },
        ];
        if (!post.isMine) {
          menuItems.push({ label: '私信作者', onSelect: () => onMessageAuthor(post.author.id) });
        }

        return (
          <article
            key={post.id}
            className="border-b border-line bg-white pb-1 last:border-b-0"
            style={{ contentVisibility: 'auto', containIntrinsicSize: '680px' }}
          >
            <header className="flex items-center gap-3 px-4 py-3">
              <button className="flex min-w-0 items-center gap-3 text-left" type="button" onClick={() => onOpenProfile(post.author.id)}>
                <CommunityAvatar
                  className="size-[42px] bg-[linear-gradient(145deg,#f4f4f5,#e4e4e7)] ring-0 [&>span]:text-[15px] [&>span]:font-extrabold [&>span]:text-[#61616a]"
                  fallbackLabel={authorInitial}
                  src={post.author.avatarUrl}
                />
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-bold">{post.author.displayName}</strong>
                  <time className="mt-0.5 block text-[11px] text-muted">{formatPublishedAt(post.publishedAt)}</time>
                </span>
              </button>
              <ActionMenu className="ml-auto" items={menuItems} />
            </header>

            <button className="relative flex w-full justify-center overflow-hidden bg-white" type="button" onClick={() => onOpenPost(post.id)}>
              <PrimaryImage
                alt={post.title || '好饭主图'}
                eager={postIndex === 0}
                image={primaryImage}
                imageUrl={primaryImageUrl}
              />
              {post.imageCount > 1 ? (
                <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[11px] font-medium text-white">1/{post.imageCount}</span>
              ) : null}
            </button>

            <div className="flex items-center gap-4 px-4 pt-3.5">
              <button
                aria-label={post.likedByMe ? '取消点赞' : '点赞'}
                className={post.likedByMe ? 'text-error' : 'text-ink'}
                disabled={post.isMine || pendingLikePostId === post.id}
                type="button"
                onClick={() => void toggleLike(post)}
              >
                <Heart aria-hidden="true" className="size-6" fill={post.likedByMe ? 'currentColor' : 'none'} strokeWidth={1.9} />
              </button>
              <button aria-label="查看评论" type="button" onClick={() => onOpenPost(post.id)}>
                <MessageCircle aria-hidden="true" className="size-6" strokeWidth={1.9} />
              </button>
              {!post.isMine ? (
                <button aria-label="私信作者" type="button" onClick={() => onMessageAuthor(post.author.id)}>
                  <Send aria-hidden="true" className="size-6" strokeWidth={1.9} />
                </button>
              ) : null}
            </div>

            <div className="px-4 pb-4 pt-2.5">
              <p className="text-sm font-bold">{post.likeCount} 个赞</p>
              <button className="mt-2 block w-full text-left" type="button" onClick={() => onOpenPost(post.id)}>
                <span className="text-clamp-2 break-words text-sm leading-6 [overflow-wrap:anywhere]">
                  <strong>{post.title}</strong>
                  {post.content ? <span> · {post.content}</span> : null}
                </span>
              </button>
              <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-xs text-muted">
                <span className="truncate">{postMeta(post)}</span>
                {post.commentCount > 0 ? (
                  <button className="shrink-0" type="button" onClick={() => onOpenPost(post.id)}>{post.commentCount} 条评论</button>
                ) : null}
              </div>
            </div>
          </article>
        );
      }) : null}

      {postsQuery.hasNextPage ? (
        <div className="flex justify-center border-t border-line px-4 py-4">
          <Button disabled={postsQuery.isFetchingNextPage} size="sm" type="button" variant="secondary" onClick={() => void postsQuery.fetchNextPage()}>
            {postsQuery.isFetchingNextPage ? '加载中…' : '加载更多'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
