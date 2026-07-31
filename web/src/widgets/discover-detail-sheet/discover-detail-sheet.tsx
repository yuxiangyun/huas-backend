/**
 * [INPUT]: 依赖 Discover 查询/写入 hooks、点赞、评论、社区资料、媒体查看器与短任务弹层
 * [OUTPUT]: 对外提供 DiscoverDetailSheet，以单一阅读顺序展示好饭详情并编排点赞、私信、评论和删除
 * [POS]: widgets/discover-detail-sheet 的业务容器，保留 Discover mutation 语义并复用无请求评论 UI
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Heart, MessageCircle, Send } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
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
import { buildMediaUrl } from '@/shared/api/media';
import { cn } from '@/shared/lib/cn';
import { ActionMenu } from '@/shared/ui/action-menu';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
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

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function DiscoverDetailSheet({ postId, onClose, onMessageAuthor, onOpenProfile }: DiscoverDetailSheetProps) {
  const postQuery = useDiscoverPostDetailQuery(postId);
  const metaQuery = useDiscoverMetaQuery();
  const commentPageSize = metaQuery.data?.pagination.defaultCommentPageSize ?? 50;
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
  const [imageViewerRequested, setImageViewerRequested] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<CommentReplyTarget | null>(null);

  useEffect(() => {
    setActionMessage(null);
    setActiveImageIndex(null);
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
    try {
      setActionMessage(null);
      await deleteMutation.mutateAsync({ postId });
      setDeleteConfirmOpen(false);
      onClose();
    } catch {
      setActionMessage('删除失败，请重试');
    }
  };

  const submitComment = async () => {
    if (!postId) return;
    const content = commentDraft.trim();
    if (!content) return;
    if (content.length > maxCommentLength) {
      setActionMessage(`评论不能超过 ${maxCommentLength} 个字`);
      return;
    }
    try {
      setActionMessage(null);
      await createCommentMutation.mutateAsync({ postId, content, parentCommentId: replyTarget?.id ?? null });
      setCommentDraft('');
      setReplyTarget(null);
    } catch {
      setActionMessage('发送失败，请重试');
    }
  };

  const toggleLike = async () => {
    if (!post) return;
    try {
      setActionMessage(null);
      if (post.likedByMe) await unlikeMutation.mutateAsync({ postId: post.id });
      else await likeMutation.mutateAsync({ postId: post.id });
    } catch {
      setActionMessage('操作失败，请重试');
    }
  };

  const imageItems = post?.images.map((image, imageIndex) => ({
    src: buildMediaUrl(image.url),
    alt: `${post.title || post.category} · 第 ${imageIndex + 1} 张`,
    key: image.url,
  })) ?? [];
  const imageCount = post?.images.length ?? 0;
  const imageGridClassName = cn('grid gap-2', imageCount <= 1 ? 'grid-cols-1' : imageCount === 2 ? 'grid-cols-2' : 'grid-cols-3');

  return (
    <>
      <BottomSheet open={Boolean(postId)} closeLabel="好饭详情" contentClassName="space-y-5" onClose={onClose}>
        {postQuery.isLoading ? (
          <div className="space-y-4" aria-hidden="true">
            <div className="h-7 w-2/3 animate-pulse rounded bg-shell-strong" />
            <div className="aspect-[4/3] animate-pulse rounded-[0.75rem] bg-shell-strong" />
            <div className="h-24 animate-pulse rounded bg-shell-strong" />
          </div>
        ) : null}

        {postQuery.isError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-error">加载失败，请重试</p>
            <Button size="xs" type="button" variant="ghost" onClick={onClose}>关闭</Button>
          </div>
        ) : null}

        {post ? (
          <>
            <header className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-muted">{[post.category, post.storeName, post.priceText].filter(Boolean).join(' · ')}</p>
                  <h2 className="mt-1 break-words text-xl font-semibold leading-7 tracking-[-0.025em]">{post.title || post.category}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {post.isMine ? (
                    <ActionMenu items={[{ label: '删除', disabled: deleteMutation.isPending, tone: 'danger', onSelect: () => setDeleteConfirmOpen(true) }]} />
                  ) : null}
                  <Button size="xs" type="button" variant="ghost" onClick={onClose}>关闭</Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <button className="flex min-w-0 items-center gap-2 rounded-[0.375rem] text-left hover:opacity-70" type="button" onClick={() => onOpenProfile(post.author.id)}>
                  <CommunityAvatar className="size-6 rounded-full text-[0.65rem]" fallbackLabel={null} src={post.author.avatarUrl} />
                  <span className="truncate">{post.author.displayName} · {formatPublishedAt(post.publishedAt)}</span>
                </button>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="inline-flex items-center gap-1"><Heart aria-hidden="true" className="size-3.5" fill={post.likedByMe ? 'currentColor' : 'none'} />{post.likeCount}</span>
                  <span className="inline-flex items-center gap-1"><MessageCircle aria-hidden="true" className="size-3.5" />{post.commentCount}</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={likeBusy} size="xs" type="button" variant={post.likedByMe ? 'subtle' : 'secondary'} onClick={() => void toggleLike()}>
                  <Heart aria-hidden="true" className="size-3.5" fill={post.likedByMe ? 'currentColor' : 'none'} />
                  {post.likedByMe ? '已赞' : '点赞'}
                </Button>
                {!post.isMine ? (
                  <Button size="xs" type="button" variant="secondary" onClick={() => onMessageAuthor(post.author.id)}>
                    <Send aria-hidden="true" className="size-3.5" />
                    私信作者
                  </Button>
                ) : null}
              </div>
            </header>

            {post.images.length > 0 ? (
              <div className={imageGridClassName}>
                {post.images.map((image, imageIndex) => (
                  <button
                    key={image.url}
                    className={cn('overflow-hidden rounded-[0.625rem] border border-line', imageCount === 1 && 'mx-auto w-full max-w-[28rem]')}
                    type="button"
                    onClick={() => setActiveImageIndex(imageIndex)}
                  >
                    <img alt={post.title || '推荐图片'} className={cn('w-full object-cover', imageCount === 1 ? 'max-h-[34rem]' : 'aspect-square')} src={buildMediaUrl(image.url)} />
                  </button>
                ))}
              </div>
            ) : null}

            <p className="break-words text-sm leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">{post.content}</p>

            {post.tags.length > 0 ? (
              <p className="break-words text-sm text-muted">{post.tags.map((tag) => `#${tag}`).join('  ')}</p>
            ) : null}

            <section className="space-y-3 border-t border-line pt-4">
              <h3 className="text-base font-semibold">评论</h3>
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
                  setActionMessage(null);
                  deleteCommentMutation.mutate({ commentId }, { onError: () => setActionMessage('删除评论失败，请重试') });
                }}
                onLoadMore={() => void commentsQuery.fetchNextPage()}
                onReply={setReplyTarget}
              />
              <CommentComposer
                draft={commentDraft}
                maxLength={maxCommentLength}
                pending={createCommentMutation.isPending}
                replyTarget={replyTarget}
                onCancelReply={() => setReplyTarget(null)}
                onDraftChange={setCommentDraft}
                onSubmit={() => void submitComment()}
              />
            </section>

            {actionMessage ? <p className="text-sm text-error">{actionMessage}</p> : null}
          </>
        ) : null}
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
          <LazyImageViewer index={activeImageIndex} items={imageItems} onClose={() => setActiveImageIndex(null)} onIndexChange={setActiveImageIndex} />
        </Suspense>
      ) : null}
    </>
  );
}
