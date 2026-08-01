/**
 * [INPUT]: 依赖 Treehole 查询/写入、私有多图轮播、全屏详情容器、评论树与图片查看器
 * [OUTPUT]: 对外提供 TreeholeDetailSheet，以移动优先的全屏单列阅读、固定评论输入器和独立图片查看器展示树洞详情
 * [POS]: widgets/treehole-detail-sheet 的详情业务容器，以帖子身份隔离异步反馈，把详情阅读和媒体预览明确分层
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Heart, MessageCircle, Send, Share2 } from 'lucide-react';
import {
  useCreateTreeholeCommentMutation,
  useDeleteTreeholeCommentMutation,
  useDeleteTreeholePostMutation,
  useLikeTreeholePostMutation,
  useTreeholeInfiniteCommentsQuery,
  useTreeholeMetaQuery,
  useTreeholePostDetailQuery,
  useUnlikeTreeholePostMutation,
} from '@/entities/treehole/api/treehole-queries';
import type { TreeholePost } from '@/entities/treehole/model/treehole-types';
import { TreeholeMediaCarousel } from '@/entities/treehole/ui/treehole-post-media';
import { ActionMenu } from '@/shared/ui/action-menu';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
import { IconButton } from '@/shared/ui/icon-button';
import { PrivateMediaImage } from '@/shared/ui/private-media-image';
import type { ImageViewerRenderContext } from '@/shared/ui/image-viewer';
import { SocialCountAction } from '@/shared/ui/social-count-action';
import { CommentComposer, CommentThread, type CommentReplyTarget } from '@/widgets/comment-thread/comment-thread';

const loadImageViewer = () => import('@/shared/ui/image-viewer');
const LazyImageViewer = lazy(async () => {
  const module = await loadImageViewer();
  return { default: module.ImageViewer };
});

interface TreeholeDetailSheetProps {
  postId: number | null;
  onClose: () => void;
  onMessageAuthor: (userId: number) => void;
  onOpenProfile: (userId: number) => void;
  onSharePost: (post: TreeholePost) => void;
}

function renderPrivateImage({ item, className, thumbnail }: ImageViewerRenderContext) {
  return <PrivateMediaImage alt={item.alt} className={thumbnail ? `${className} min-h-0` : className} src={item.src} />;
}

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DetailAuthor({ post, onOpenProfile }: { post: TreeholePost; onOpenProfile: (userId: number) => void }) {
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

function TreeholeActionBar({
  post,
  likeBusy,
  onToggleLike,
  onFocusComments,
  onMessageAuthor,
  onSharePost,
}: {
  post: TreeholePost;
  likeBusy: boolean;
  onToggleLike: () => void;
  onFocusComments: () => void;
  onMessageAuthor: () => void;
  onSharePost: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-y border-line py-2">
      <SocialCountAction
        active={post.viewer.liked}
        aria-label={post.viewer.isMine ? '不能点赞自己的帖子' : post.viewer.liked ? '取消点赞' : '点赞'}
        aria-pressed={post.viewer.liked}
        count={post.stats.likeCount}
        disabled={post.viewer.isMine || likeBusy}
        icon={<Heart aria-hidden="true" className="size-6" fill={post.viewer.liked ? 'currentColor' : 'none'} strokeWidth={1.9} />}
        onClick={onToggleLike}
      />
      <SocialCountAction
        aria-label={`查看 ${post.stats.commentCount} 条评论`}
        count={post.stats.commentCount}
        icon={<MessageCircle aria-hidden="true" className="size-6" strokeWidth={1.9} />}
        onClick={onFocusComments}
      />
      <button
        aria-label="分享帖子"
        className="grid size-10 place-items-center rounded-full transition-opacity hover:opacity-60"
        type="button"
        onClick={onSharePost}
      >
        <Share2 aria-hidden="true" className="size-6" strokeWidth={1.9} />
      </button>
      {!post.viewer.isMine ? (
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

function TreeholeDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-[var(--layout-shell-max)] px-4 py-6 sm:px-6 sm:py-10" aria-hidden="true">
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,34rem)] lg:gap-8">
        <div className="aspect-[4/5] animate-pulse rounded-[1.25rem] bg-shell-strong" />
        <div className="space-y-5">
          <div className="h-12 w-48 animate-pulse rounded bg-shell-strong" />
          <div className="h-24 animate-pulse rounded bg-shell-strong" />
          <div className="h-48 animate-pulse rounded bg-shell-strong" />
        </div>
      </div>
    </div>
  );
}

export function TreeholeDetailSheet({ postId, onClose, onMessageAuthor, onOpenProfile, onSharePost }: TreeholeDetailSheetProps) {
  const postQuery = useTreeholePostDetailQuery(postId);
  const commentsQuery = useTreeholeInfiniteCommentsQuery(postId, { pageSize: 20 });
  const metaQuery = useTreeholeMetaQuery();
  const likeMutation = useLikeTreeholePostMutation();
  const unlikeMutation = useUnlikeTreeholePostMutation();
  const createCommentMutation = useCreateTreeholeCommentMutation();
  const deleteCommentMutation = useDeleteTreeholeCommentMutation();
  const deletePostMutation = useDeleteTreeholePostMutation();
  const post = postQuery.data;
  const comments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const maxCommentLength = metaQuery.data?.limits.maxCommentLength ?? 200;
  const likeBusy = likeMutation.isPending || unlikeMutation.isPending;
  const [commentDraft, setCommentDraft] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<CommentReplyTarget | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [imageViewerRequested, setImageViewerRequested] = useState(false);
  const activePostIdRef = useRef(postId);

  useLayoutEffect(() => {
    activePostIdRef.current = postId;
  }, [postId]);

  useEffect(() => {
    setCommentDraft('');
    setActionMessage(null);
    setDeleteConfirmOpen(false);
    setReplyTarget(null);
    setActiveImageIndex(null);
  }, [postId]);

  useEffect(() => {
    if (activeImageIndex === null) return;
    setImageViewerRequested(true);
    void loadImageViewer();
  }, [activeImageIndex]);

  const submitComment = async () => {
    if (!postId) return;

    const requestedPostId = postId;
    const submittedDraft = commentDraft;
    const submittedReplyId = replyTarget?.id ?? null;
    const content = commentDraft.trim();
    if (!content) {
      setActionMessage('先写点评论内容再发送');
      return;
    }
    if (content.length > maxCommentLength) {
      setActionMessage(`评论内容不能超过 ${maxCommentLength} 个字`);
      return;
    }

    try {
      setActionMessage(null);
      await createCommentMutation.mutateAsync({
        postId: requestedPostId,
        content,
        parentCommentId: submittedReplyId,
      });
      if (activePostIdRef.current !== requestedPostId) return;
      setCommentDraft((current) => current === submittedDraft ? '' : current);
      setReplyTarget((current) => (current?.id ?? null) === submittedReplyId ? null : current);
    } catch (error) {
      if (activePostIdRef.current !== requestedPostId) return;
      setActionMessage(error instanceof Error ? error.message : '评论发送失败，请稍后重试');
    }
  };

  const handleToggleLike = async () => {
    if (!post) return;

    const requestedPostId = post.id;
    try {
      setActionMessage(null);
      if (post.viewer.liked) await unlikeMutation.mutateAsync({ postId: requestedPostId });
      else await likeMutation.mutateAsync({ postId: requestedPostId });
    } catch (error) {
      if (activePostIdRef.current !== requestedPostId) return;
      setActionMessage(error instanceof Error ? error.message : '操作失败，请稍后重试');
    }
  };

  const handleDeletePost = async () => {
    if (!postId) return;

    const requestedPostId = postId;
    try {
      setActionMessage(null);
      await deletePostMutation.mutateAsync({ postId: requestedPostId });
      if (activePostIdRef.current !== requestedPostId) return;
      setDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      if (activePostIdRef.current !== requestedPostId) return;
      setActionMessage(error instanceof Error ? error.message : '删除失败，请稍后重试');
    }
  };

  const focusComments = () => {
    document.getElementById('treehole-detail-comment-input')?.focus();
  };

  return (
    <>
      <BottomSheet
        fullScreen
        open={Boolean(postId)}
        closeLabel="树洞详情"
        contentClassName="p-0"
        footer={post ? (
          <div className="mx-auto w-full max-w-[var(--layout-shell-max)]">
            <CommentComposer
              compact
              autoFocus={Boolean(replyTarget)}
              draft={commentDraft}
              inputId="treehole-detail-comment-input"
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
                <p className="truncate text-sm font-semibold">树洞详情</p>
                {post ? <p className="truncate text-xs text-muted">{post.images.length > 0 ? '图文动态' : '文字动态'}</p> : null}
              </div>
              {post?.viewer.isMine ? (
                <ActionMenu
                  items={[{
                    label: '删除',
                    disabled: deletePostMutation.isPending,
                    tone: 'danger',
                    onSelect: () => setDeleteConfirmOpen(true),
                  }]}
                />
              ) : <span className="size-10" aria-hidden="true" />}
            </div>
          </header>

          {postQuery.isLoading ? <TreeholeDetailLoading /> : null}

          {postQuery.isError ? (
            <div className="mx-auto flex w-full max-w-[var(--layout-shell-max)] items-center justify-between gap-3 px-4 py-10 sm:px-6">
              <p className="text-sm text-error">加载失败，请重试</p>
              <Button size="sm" type="button" variant="secondary" onClick={() => void postQuery.refetch()}>重试</Button>
            </div>
          ) : null}

          {post ? (
            <main className="mx-auto w-full max-w-[var(--layout-shell-max)] px-4 py-5 sm:px-6 sm:py-8">
              <div className={post.images.length > 0 ? 'lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,34rem)] lg:items-start lg:gap-8' : 'mx-auto max-w-[44rem]'}>
                {post.images.length > 0 ? (
                  <div className="min-w-0">
                    <div className="mb-4 lg:hidden">
                      <DetailAuthor post={post} onOpenProfile={onOpenProfile} />
                    </div>
                    <div className="-mx-4 overflow-hidden sm:mx-0 sm:rounded-[1.25rem] sm:ring-1 sm:ring-black/5 lg:sticky lg:top-[calc(4.5rem+env(safe-area-inset-top))]">
                      <TreeholeMediaCarousel
                        alt={`${post.author.displayName} 发布的图片`}
                        images={post.images}
                        onOpenImage={setActiveImageIndex}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="min-w-0 space-y-5">
                  {post.images.length > 0 ? (
                    <div className="hidden lg:block">
                      <DetailAuthor post={post} onOpenProfile={onOpenProfile} />
                    </div>
                  ) : <DetailAuthor post={post} onOpenProfile={onOpenProfile} />}

                  <p
                    className={post.images.length > 0
                      ? 'mt-4 break-words text-[1rem] leading-7 whitespace-pre-wrap text-ink [overflow-wrap:anywhere] lg:mt-0'
                      : 'break-words text-[1rem] leading-7 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]'}
                  >
                    {post.content}
                  </p>

                  <TreeholeActionBar
                    likeBusy={likeBusy}
                    post={post}
                    onFocusComments={focusComments}
                    onMessageAuthor={() => onMessageAuthor(post.author.id)}
                    onSharePost={() => onSharePost(post)}
                    onToggleLike={() => void handleToggleLike()}
                  />

                  <section id="treehole-detail-comments" className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-base font-bold">评论</h2>
                      <span className="text-xs text-muted">{post.stats.commentCount} 条</span>
                    </div>
                    <CommentThread
                      deletingCommentId={
                        deleteCommentMutation.isPending
                          ? deleteCommentMutation.variables?.commentId ?? null
                          : null
                      }
                      errorMessage={commentsQuery.error instanceof Error ? commentsQuery.error.message : '评论加载失败'}
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
                        isMine: comment.isMine,
                        authorLabel: comment.author.displayName,
                        createdAtLabel: formatPublishedAt(comment.createdAt),
                      }))}
                      onAuthorClick={onOpenProfile}
                      endMessage={null}
                      onDelete={(commentId) => {
                        const requestedPostId = postId;
                        setActionMessage(null);
                        deleteCommentMutation.mutate(
                          { commentId },
                          {
                            onError: (error) => {
                              if (activePostIdRef.current === requestedPostId) {
                                setActionMessage(error instanceof Error ? error.message : '删除评论失败，请稍后重试');
                              }
                            },
                          },
                        );
                      }}
                      onLoadMore={() => void commentsQuery.fetchNextPage()}
                      onReply={setReplyTarget}
                    />
                  </section>

                  {actionMessage ? (
                    <div className="rounded-[0.875rem] bg-error-soft px-4 py-3 text-sm leading-6 text-error">
                      {actionMessage}
                    </div>
                  ) : null}
                </div>
              </div>
            </main>
          ) : null}
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={deleteConfirmOpen}
        busy={deletePostMutation.isPending}
        description="删除后不可恢复。"
        title="删除动态？"
        confirmLabel="删除"
        tone="danger"
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleDeletePost()}
      />

      {imageViewerRequested ? (
        <Suspense fallback={null}>
          <LazyImageViewer
            index={activeImageIndex}
            items={post?.images.map((image, imageIndex) => ({
              src: image.url,
              alt: `${post.author.displayName} 发布的第 ${imageIndex + 1} 张图片`,
              key: image.url,
            })) ?? []}
            renderImage={renderPrivateImage}
            thumbnailWindow={1}
            onClose={() => setActiveImageIndex(null)}
            onIndexChange={setActiveImageIndex}
          />
        </Suspense>
      ) : null}
    </>
  );
}
