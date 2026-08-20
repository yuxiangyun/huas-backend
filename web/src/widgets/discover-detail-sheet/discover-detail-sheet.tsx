/**
 * [INPUT]: 依赖 Discover 查询/写入 hooks、全屏详情容器、媒体轮播、社区资料与评论树
 * [OUTPUT]: 对外提供 DiscoverDetailSheet，以全屏双栏/单栏阅读、支持作者自赞的互动栏、固定评论输入器和独立图片查看器展示好饭详情
 * [POS]: widgets/discover-detail-sheet 的详情业务容器，保留 URL 深链与 mutation 语义，将详情阅读和图片预览明确分层
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, MessageCircle, Send } from 'lucide-react';
import {
  useCreateDiscoverCommentMutation,
  useDeleteDiscoverCommentMutation,
  useDeleteDiscoverPostMutation,
  useDiscoverInfiniteCommentsQuery,
  useDiscoverMetaQuery,
  useDiscoverPostDetailQuery,
  useLikeDiscoverPostMutation,
  useUnlikeDiscoverPostMutation,
} from '@/entities/discover/api/discover-queries';
import type { DiscoverPost } from '@/entities/discover/model/discover-types';
import { buildMediaUrl } from '@/shared/api/media';
import { cn } from '@/shared/lib/cn';
import { ActionMenu } from '@/shared/ui/action-menu';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
import { IconButton } from '@/shared/ui/icon-button';
import { SocialCountAction } from '@/shared/ui/social-count-action';
import { CommentComposer, CommentThread, type CommentReplyTarget } from '@/widgets/comment-thread/comment-thread';

const loadImageViewer = () => import('@/shared/ui/image-viewer');
const LazyImageViewer = lazy(async () => {
  const module = await loadImageViewer();
  return { default: module.ImageViewer };
});

interface DiscoverDetailSheetProps {
  postId: number | null;
  onClose: () => void;
  onMessageAuthor: (userId: number) => void;
  onOpenProfile: (userId: number) => void;
}

interface DiscoverGalleryProps {
  post: DiscoverPost;
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onOpenImage: (index: number) => void;
}

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function galleryStageStyle(image: DiscoverPost['images'][number] | undefined) {
  const sourceRatio = image?.width && image.height ? image.width / image.height : 4 / 5;
  const aspectRatio = Math.min(1.91, Math.max(4 / 5, sourceRatio));
  return { aspectRatio: String(aspectRatio), maxHeight: 'min(68dvh, 46rem)' };
}

function DiscoverGallery({ post, activeIndex, onIndexChange, onOpenImage }: DiscoverGalleryProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeImage = post.images[activeIndex] ?? post.images[0];

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ left: viewport.clientWidth * activeIndex, behavior: 'auto' });
  }, [activeIndex]);

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth <= 0) return;
    const nextIndex = Math.min(
      post.images.length - 1,
      Math.max(0, Math.round(viewport.scrollLeft / viewport.clientWidth)),
    );
    if (nextIndex !== activeIndex) onIndexChange(nextIndex);
  };

  if (post.images.length === 0) return null;

  return (
    <div className="space-y-3">
      <div
        className="relative overflow-hidden rounded-none bg-[#f5f5f5] sm:rounded-[1.25rem] sm:ring-1 sm:ring-black/5"
        style={galleryStageStyle(activeImage)}
      >
        <div
          ref={viewportRef}
          aria-label={`好饭图片，共 ${post.images.length} 张`}
          className="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-hidden"
          onScroll={handleScroll}
        >
          {post.images.map((image, imageIndex) => (
            <button
              key={image.url}
              aria-label={`查看第 ${imageIndex + 1} 张图片`}
              className="grid size-full min-w-full snap-center place-items-center bg-white"
              type="button"
              onClick={() => onOpenImage(imageIndex)}
            >
              <img
                alt={`${post.title || post.category} · 第 ${imageIndex + 1} 张`}
                className="size-full object-contain"
                decoding="async"
                height={image.height}
                loading={Math.abs(imageIndex - activeIndex) <= 1 ? 'eager' : 'lazy'}
                src={buildMediaUrl(image.url)}
                width={image.width}
              />
            </button>
          ))}
        </div>

        {post.images.length > 1 ? (
          <>
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white">
              {activeIndex + 1}/{post.images.length}
            </span>
            <IconButton
              className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/55 text-white shadow-none hover:bg-black/75 hover:text-white sm:inline-flex"
              disabled={activeIndex === 0}
              icon={<ChevronLeft aria-hidden="true" className="size-5" />}
              label="上一张"
              size="sm"
              onClick={() => onIndexChange(activeIndex - 1)}
            />
            <IconButton
              className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/55 text-white shadow-none hover:bg-black/75 hover:text-white sm:inline-flex"
              disabled={activeIndex === post.images.length - 1}
              icon={<ChevronRight aria-hidden="true" className="size-5" />}
              label="下一张"
              size="sm"
              onClick={() => onIndexChange(activeIndex + 1)}
            />
          </>
        ) : null}
      </div>

      {post.images.length > 1 ? (
        <div className="flex justify-center gap-1.5" aria-label="图片位置">
          {post.images.map((image, imageIndex) => (
            <button
              key={image.url}
              aria-current={imageIndex === activeIndex ? 'true' : undefined}
              aria-label={`切换到第 ${imageIndex + 1} 张图片`}
              className={cn(
                'size-1.5 rounded-full transition-colors',
                imageIndex === activeIndex ? 'bg-ink' : 'bg-line',
              )}
              type="button"
              onClick={() => onIndexChange(imageIndex)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DetailAuthor({ post, onOpenProfile }: { post: DiscoverPost; onOpenProfile: (userId: number) => void }) {
  return (
    <button
      className="flex min-w-0 items-center gap-3 rounded-[0.5rem] text-left transition-opacity hover:opacity-70"
      type="button"
      onClick={() => onOpenProfile(post.author.id)}
    >
      <CommunityAvatar
        alt={`${post.author.displayName} 的头像`}
        className="size-10 text-sm"
        fallbackLabel={Array.from(post.author.displayName)[0] ?? '同'}
        src={post.author.avatarUrl}
      />
      <span className="min-w-0">
        <strong className="block truncate text-sm font-bold">{post.author.displayName}</strong>
        <time className="mt-0.5 block text-xs text-muted">{formatPublishedAt(post.publishedAt)}</time>
      </span>
    </button>
  );
}

function DiscoverActionBar({
  post,
  likeBusy,
  onToggleLike,
  onFocusComments,
  onMessageAuthor,
}: {
  post: DiscoverPost;
  likeBusy: boolean;
  onToggleLike: () => void;
  onFocusComments: () => void;
  onMessageAuthor: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-y border-line py-2">
      <SocialCountAction
        active={post.likedByMe}
        aria-label={post.likedByMe ? '取消点赞' : '点赞'}
        aria-pressed={post.likedByMe}
        count={post.likeCount}
        disabled={likeBusy}
        icon={<Heart aria-hidden="true" className="size-6" fill={post.likedByMe ? 'currentColor' : 'none'} strokeWidth={1.9} />}
        onClick={onToggleLike}
      />
      <SocialCountAction
        aria-label={`查看 ${post.commentCount} 条评论`}
        count={post.commentCount}
        icon={<MessageCircle aria-hidden="true" className="size-6" strokeWidth={1.9} />}
        onClick={onFocusComments}
      />
      {!post.isMine ? (
        <button
          aria-label="私信作者"
          className="grid size-10 place-items-center rounded-full transition-opacity hover:opacity-60"
          type="button"
          onClick={onMessageAuthor}
        >
          <Send aria-hidden="true" className="size-6" strokeWidth={1.9} />
        </button>
      ) : null}
    </div>
  );
}

function DiscoverDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-[var(--layout-shell-max)] px-4 py-6 sm:px-6 sm:py-10" aria-hidden="true">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,34rem)]">
        <div className="aspect-[4/5] animate-pulse rounded-[1.25rem] bg-shell-strong" />
        <div className="space-y-5">
          <div className="h-12 w-48 animate-pulse rounded bg-shell-strong" />
          <div className="h-7 w-2/3 animate-pulse rounded bg-shell-strong" />
          <div className="h-32 animate-pulse rounded bg-shell-strong" />
          <div className="h-48 animate-pulse rounded bg-shell-strong" />
        </div>
      </div>
    </div>
  );
}

export function DiscoverDetailSheet({ postId, onClose, onMessageAuthor, onOpenProfile }: DiscoverDetailSheetProps) {
  const postQuery = useDiscoverPostDetailQuery(postId);
  const metaQuery = useDiscoverMetaQuery();
  const commentPageSize = Math.min(20, metaQuery.data?.pagination.maxCommentPageSize ?? 20);
  const commentsQuery = useDiscoverInfiniteCommentsQuery(postId, { pageSize: commentPageSize });
  const likeMutation = useLikeDiscoverPostMutation();
  const unlikeMutation = useUnlikeDiscoverPostMutation();
  const createCommentMutation = useCreateDiscoverCommentMutation();
  const deleteCommentMutation = useDeleteDiscoverCommentMutation();
  const deleteMutation = useDeleteDiscoverPostMutation();
  const post = postQuery.data;
  const comments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const maxCommentLength = metaQuery.data?.limits.maxCommentLength ?? 200;
  const likeBusy = likeMutation.isPending || unlikeMutation.isPending;
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [imageViewerRequested, setImageViewerRequested] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<CommentReplyTarget | null>(null);
  const activePostIdRef = useRef(postId);

  useLayoutEffect(() => {
    activePostIdRef.current = postId;
  }, [postId]);

  useEffect(() => {
    setActionMessage(null);
    setActiveImageIndex(null);
    setGalleryIndex(0);
    setDeleteConfirmOpen(false);
    setCommentDraft('');
    setReplyTarget(null);
  }, [postId]);

  useEffect(() => {
    if (activeImageIndex === null) return;
    setImageViewerRequested(true);
    void loadImageViewer();
  }, [activeImageIndex]);

  const handleDelete = async () => {
    if (!postId) return;
    const requestedPostId = postId;
    try {
      setActionMessage(null);
      await deleteMutation.mutateAsync({ postId: requestedPostId });
      if (activePostIdRef.current !== requestedPostId) return;
      setDeleteConfirmOpen(false);
      onClose();
    } catch {
      if (activePostIdRef.current !== requestedPostId) return;
      setActionMessage('删除失败，请重试');
    }
  };

  const submitComment = async () => {
    if (!postId) return;
    const requestedPostId = postId;
    const submittedDraft = commentDraft;
    const submittedReplyId = replyTarget?.id ?? null;
    const content = commentDraft.trim();
    if (!content) return;
    if (content.length > maxCommentLength) {
      setActionMessage(`评论不能超过 ${maxCommentLength} 个字`);
      return;
    }
    try {
      setActionMessage(null);
      await createCommentMutation.mutateAsync({ postId: requestedPostId, content, parentCommentId: submittedReplyId });
      if (activePostIdRef.current !== requestedPostId) return;
      setCommentDraft((current) => current === submittedDraft ? '' : current);
      setReplyTarget((current) => (current?.id ?? null) === submittedReplyId ? null : current);
    } catch {
      if (activePostIdRef.current !== requestedPostId) return;
      setActionMessage('发送失败，请重试');
    }
  };

  const toggleLike = async () => {
    if (!post) return;
    const requestedPostId = post.id;
    try {
      setActionMessage(null);
      if (post.likedByMe) await unlikeMutation.mutateAsync({ postId: requestedPostId });
      else await likeMutation.mutateAsync({ postId: requestedPostId });
    } catch {
      if (activePostIdRef.current !== requestedPostId) return;
      setActionMessage('操作失败，请重试');
    }
  };

  const focusComments = () => {
    document.getElementById('discover-detail-comment-input')?.focus();
  };

  const imageItems = post?.images.map((image, imageIndex) => ({
    src: buildMediaUrl(image.url),
    alt: `${post.title || post.category} · 第 ${imageIndex + 1} 张`,
    key: image.url,
  })) ?? [];

  return (
    <>
      <BottomSheet
        fullScreen
        open={Boolean(postId)}
        closeLabel="好饭详情"
        contentClassName="p-0"
        footer={post ? (
          <div className="mx-auto w-full max-w-[var(--layout-shell-max)]">
            <CommentComposer
              compact
              autoFocus={Boolean(replyTarget)}
              draft={commentDraft}
              inputId="discover-detail-comment-input"
              maxLength={maxCommentLength}
              pending={createCommentMutation.isPending}
              replyTarget={replyTarget}
              onCancelReply={() => setReplyTarget(null)}
              onDraftChange={setCommentDraft}
              onSubmit={() => void submitComment()}
            />
          </div>
        ) : undefined}
        footerClassName="border-t border-line bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur sm:px-6 sm:pb-4"
        onClose={onClose}
      >
        <div className="min-h-full bg-[#fafafa]">
          <header className="sticky top-0 z-20 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
            <div className="mx-auto flex h-14 w-full max-w-[var(--layout-shell-max)] items-center justify-between gap-3 px-4 sm:px-6">
              <IconButton
                icon={<ArrowLeft aria-hidden="true" className="size-5" />}
                label="返回信息流"
                size="md"
                variant="ghost"
                onClick={onClose}
              />
              <div className="min-w-0 text-center">
                <p className="truncate text-sm font-semibold">好饭详情</p>
                {post ? <p className="truncate text-xs text-muted">{post.category}</p> : null}
              </div>
              {post?.isMine ? (
                <ActionMenu
                  items={[{ label: '删除', disabled: deleteMutation.isPending, tone: 'danger', onSelect: () => setDeleteConfirmOpen(true) }]}
                />
              ) : <span className="size-10" aria-hidden="true" />}
            </div>
          </header>

          {postQuery.isLoading ? <DiscoverDetailLoading /> : null}

          {postQuery.isError ? (
            <div className="mx-auto flex w-full max-w-[var(--layout-shell-max)] items-center justify-between gap-3 px-4 py-10 sm:px-6">
              <p className="text-sm text-error">加载失败，请重试</p>
              <Button size="sm" type="button" variant="secondary" onClick={() => void postQuery.refetch()}>重试</Button>
            </div>
          ) : null}

          {post ? (
            <main className="mx-auto w-full max-w-[var(--layout-shell-max)] px-4 py-5 sm:px-6 sm:py-8">
              <div className={cn(
                'gap-8 lg:items-start',
                post.images.length > 0 ? 'lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,34rem)]' : 'mx-auto max-w-[44rem]',
              )}>
                {post.images.length > 0 ? (
                  <div className="mb-5 min-w-0 lg:sticky lg:top-[calc(4.5rem+env(safe-area-inset-top))] lg:mb-0">
                    <div className="-mx-4 sm:mx-0">
                      <DiscoverGallery
                        activeIndex={galleryIndex}
                        post={post}
                        onIndexChange={setGalleryIndex}
                        onOpenImage={setActiveImageIndex}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="min-w-0 space-y-5">
                  <DetailAuthor post={post} onOpenProfile={onOpenProfile} />

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h1 className="break-words text-xl font-bold leading-7 tracking-[-0.025em]">{post.title || post.category}</h1>
                      <span className="text-sm text-muted">{[post.storeName, post.priceText, post.category].filter(Boolean).join(' · ')}</span>
                    </div>
                    {post.content ? <p className="break-words text-[0.98rem] leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">{post.content}</p> : null}
                    {post.tags.length > 0 ? (
                      <p className="break-words text-sm text-muted">{post.tags.map((tag) => `#${tag}`).join('  ')}</p>
                    ) : null}
                  </div>

                  <DiscoverActionBar
                    likeBusy={likeBusy}
                    post={post}
                    onFocusComments={focusComments}
                    onMessageAuthor={() => onMessageAuthor(post.author.id)}
                    onToggleLike={() => void toggleLike()}
                  />

                  <section id="discover-detail-comments" className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-base font-bold">评论</h2>
                      <span className="text-xs text-muted">{post.commentCount} 条</span>
                    </div>
                    <CommentThread
                      deletingCommentId={deleteCommentMutation.isPending ? deleteCommentMutation.variables?.commentId ?? null : null}
                      errorMessage="评论加载失败"
                      hasNextPage={Boolean(commentsQuery.hasNextPage)}
                      isFetchingNextPage={commentsQuery.isFetchingNextPage}
                      isError={commentsQuery.isError}
                      isLoading={commentsQuery.isLoading}
                      items={comments.map((comment) => ({
                        id: comment.id,
                        authorId: comment.author.id,
                        parentCommentId: comment.parentCommentId,
                        content: comment.content,
                        avatarUrl: comment.author.avatarUrl,
                        avatarFallbackLabel: null,
                        isMine: comment.isMine,
                        authorLabel: comment.author.displayName,
                        createdAtLabel: formatPublishedAt(comment.createdAt),
                      }))}
                      onAuthorClick={onOpenProfile}
                      onDelete={(commentId) => {
                        const requestedPostId = postId;
                        setActionMessage(null);
                        deleteCommentMutation.mutate({ commentId }, {
                          onError: () => {
                            if (activePostIdRef.current === requestedPostId) setActionMessage('删除评论失败，请重试');
                          },
                        });
                      }}
                      onLoadMore={() => void commentsQuery.fetchNextPage()}
                      onReply={setReplyTarget}
                    />
                  </section>

                  {actionMessage ? <p className="rounded-[0.875rem] bg-error-soft px-4 py-3 text-sm text-error">{actionMessage}</p> : null}
                </div>
              </div>
            </main>
          ) : null}
        </div>
      </BottomSheet>

      <ConfirmSheet
        busy={deleteMutation.isPending}
        confirmLabel="删除"
        description="删除后不可恢复。"
        open={deleteConfirmOpen}
        title="删除推荐？"
        tone="danger"
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleDelete()}
      />

      {imageViewerRequested ? (
        <Suspense fallback={null}>
          <LazyImageViewer
            index={activeImageIndex}
            items={imageItems}
            onClose={() => setActiveImageIndex(null)}
            onIndexChange={setActiveImageIndex}
          />
        </Suspense>
      ) : null}
    </>
  );
}
