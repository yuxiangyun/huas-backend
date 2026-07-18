/**
 * [INPUT]: 依赖 Discover 查询/写入 hooks、评分与删除功能、共享评论线程、媒体查看器和 BottomSheet
 * [OUTPUT]: 对外提供 DiscoverDetailSheet，展示帖子详情并编排评分、评论、图片查看与删除
 * [POS]: widgets/discover-detail-sheet 的业务容器，保留 Discover 数据与 mutation 语义，复用无请求评论 UI
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import {
  useCreateDiscoverCommentMutation,
  useDeleteDiscoverCommentMutation,
  useDeleteDiscoverPostMutation,
  useDiscoverInfiniteCommentsQuery,
  useDiscoverMetaQuery,
  useDiscoverPostDetailQuery,
  useRateDiscoverPostMutation,
} from '@/entities/discover/api/discover-queries';
import { DeletePostButton } from '@/features/discover-delete-post/ui/delete-post-button';
import { RatingStrip } from '@/features/discover-rate-post/ui/rating-strip';
import { buildMediaUrl } from '@/shared/api/media';
import { cn } from '@/shared/lib/cn';
import { buildClassmateLabel } from '@/shared/lib/student';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';
import {
  CommentComposer,
  CommentThread,
  type CommentReplyTarget,
} from '@/widgets/comment-thread/comment-thread';

const loadImageViewer = () => import('@/shared/ui/image-viewer');

const LazyImageViewer = lazy(async () => {
  const module = await loadImageViewer();
  return { default: module.ImageViewer };
});

interface DiscoverDetailSheetProps {
  postId: number | null;
  onClose: () => void;
}

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DiscoverDetailSheet({ postId, onClose }: DiscoverDetailSheetProps) {
  const postQuery = useDiscoverPostDetailQuery(postId);
  const metaQuery = useDiscoverMetaQuery();
  const commentPageSize = metaQuery.data?.pagination.defaultCommentPageSize ?? 50;
  const commentsQuery = useDiscoverInfiniteCommentsQuery(postId, { pageSize: commentPageSize });
  const rateMutation = useRateDiscoverPostMutation();
  const createCommentMutation = useCreateDiscoverCommentMutation();
  const deleteCommentMutation = useDeleteDiscoverCommentMutation();
  const deleteMutation = useDeleteDiscoverPostMutation();
  const post = postQuery.data;
  const comments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const maxCommentLength = metaQuery.data?.limits.maxCommentLength ?? 200;
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [imageViewerRequested, setImageViewerRequested] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<CommentReplyTarget | null>(null);
  const pushToast = useToastStore((state) => state.pushToast);

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
      pushToast({
        title: '删除成功',
        variant: 'success',
      });
      setDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '删除失败，请稍后重试');
    }
  };

  const submitComment = async () => {
    if (!postId) return;

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
        postId,
        content,
        parentCommentId: replyTarget?.id ?? null,
      });
      setCommentDraft('');
      setReplyTarget(null);
      pushToast({
        title: '评论已发送',
        variant: 'success',
      });
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '评论发送失败，请稍后重试');
    }
  };

  const imageItems = post?.images.map((image, imageIndex) => ({
    src: buildMediaUrl(image.url),
    alt: `${post.title || `${post.category} · 同学推荐`} · 第 ${imageIndex + 1} 张`,
    key: image.url,
  })) ?? [];
  const imageCount = post?.images.length ?? 0;
  const imageGridClassName = cn(
    'grid gap-3',
    imageCount <= 1
      ? 'grid-cols-1'
      : imageCount === 2
        ? 'grid-cols-2'
        : 'grid-cols-3 sm:grid-cols-4'
  );
  const imageButtonClassName = cn(
    'overflow-hidden rounded-[1.1rem] sm:rounded-[1.4rem]',
    imageCount === 1 && 'mx-auto w-full max-w-[22rem] sm:max-w-[26rem]'
  );
  const imageClassName = cn(
    'w-full object-cover',
    imageCount === 1
      ? 'aspect-[4/5] max-h-[26rem] sm:max-h-[32rem]'
      : 'aspect-[3/4]'
  );

  return (
    <>
      <BottomSheet open={Boolean(postId)} closeLabel="关闭详情" contentClassName="space-y-4" onClose={onClose}>
        {postQuery.isLoading ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="h-5 w-24 animate-pulse rounded bg-shell-strong" />
                <div className="h-8 w-56 animate-pulse rounded bg-shell-strong" />
              </div>
              <div className="h-10 w-16 animate-pulse rounded-pill bg-shell-strong" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="aspect-[3/4] animate-pulse rounded-[1.4rem] bg-shell-strong"
                />
              ))}
            </div>
            <div className="h-28 animate-pulse rounded-[1.4rem] bg-shell-strong" />
            <div className="h-20 animate-pulse rounded-[1.4rem] bg-shell-strong" />
          </div>
        ) : null}

        {postQuery.isError ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-lg font-semibold text-ink">帖子加载失败</p>
                <p className="text-sm leading-6 text-muted">
                  {postQuery.error instanceof Error ? postQuery.error.message : '请求失败'}
                </p>
              </div>
              <Button size="xs" type="button" variant="subtle" onClick={onClose}>
                关闭
              </Button>
            </div>
          </div>
        ) : null}

        {post ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-pill bg-tint-soft px-3 py-1 text-xs font-medium text-ink">
                    {post.category}
                  </span>
                  {post.storeName ? (
                    <span className="rounded-pill bg-white px-3 py-1 text-xs text-muted ring-1 ring-line">
                      {post.storeName}
                    </span>
                  ) : null}
                  {post.priceText ? (
                    <span className="rounded-pill bg-white px-3 py-1 text-xs text-muted ring-1 ring-line">
                      {post.priceText}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <h3 className="text-[var(--font-title-section)] font-semibold tracking-[-0.05em] text-ink">
                    {post.title || `${post.category} · 同学推荐`}
                  </h3>
                  <p className="text-sm leading-6 text-muted">
                    {buildClassmateLabel(post.author.label)} 发布于 {formatPublishedAt(post.publishedAt)}
                  </p>
                </div>
              </div>

              <Button size="xs" type="button" variant="subtle" onClick={onClose}>
                关闭
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.45fr)_minmax(16rem,1fr)]">
              <Card className="space-y-3 rounded-[1.2rem] bg-white/78 p-3.5 shadow-none sm:rounded-[1.5rem] sm:p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-ink">内容</p>
                  <span className="text-sm text-muted">
                    {post.rating.average.toFixed(1)} 分 · {post.rating.count} 人 · {post.commentCount} 条评论
                  </span>
                </div>
                <p className="text-sm leading-7 whitespace-pre-wrap text-muted">
                  {post.content || '未填写'}
                </p>
              </Card>

              <Card className="space-y-3 rounded-[1.2rem] bg-white/78 p-3.5 shadow-none sm:rounded-[1.5rem] sm:p-4">
                <p className="text-sm font-semibold text-ink">信息</p>
                <div className="grid grid-cols-2 gap-3 text-sm text-muted">
                  <div className="rounded-[1.1rem] bg-white/80 px-3 py-3 ring-1 ring-line">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">档口</p>
                    <p className="mt-2 text-sm font-medium text-ink">{post.storeName || '未填写'}</p>
                  </div>
                  <div className="rounded-[1.1rem] bg-white/80 px-3 py-3 ring-1 ring-line">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">价格</p>
                    <p className="mt-2 text-sm font-medium text-ink">{post.priceText || '未填写'}</p>
                  </div>
                  <div className="rounded-[1.1rem] bg-white/80 px-3 py-3 ring-1 ring-line">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">图片</p>
                    <p className="mt-2 text-sm font-medium text-ink">{post.imageCount} 张</p>
                  </div>
                  <div className="rounded-[1.1rem] bg-white/80 px-3 py-3 ring-1 ring-line">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">发布</p>
                    <p className="mt-2 text-sm font-medium text-ink">{formatPublishedAt(post.publishedAt)}</p>
                  </div>
                </div>
              </Card>
            </div>

            {post.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-pill bg-white px-3 py-1.5 text-xs text-muted ring-1 ring-line"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className={imageGridClassName}>
              {post.images.map((image, imageIndex) => (
                <button
                  key={image.url}
                  className={imageButtonClassName}
                  type="button"
                  onClick={() => {
                    setImageViewerRequested(true);
                    void loadImageViewer();
                    setActiveImageIndex(imageIndex);
                  }}
                >
                  <img
                    alt={post.title || '帖子图片'}
                    className={imageClassName}
                    src={buildMediaUrl(image.url)}
                  />
                </button>
              ))}
            </div>

            <Card className="space-y-4 rounded-[1.2rem] bg-white/78 p-3.5 shadow-none sm:rounded-[1.5rem] sm:p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink">帖子评分</p>
                <p className="text-sm leading-6 text-muted">
                  {post.isMine
                    ? '自己的帖子不能评分'
                    : post.rating.userScore
                      ? `你打了 ${post.rating.userScore} 分`
                      : '可打 1-5 分'}
                </p>
              </div>

              <RatingStrip
                disabled={post.isMine || rateMutation.isPending}
                pendingScore={rateMutation.variables?.postId === post.id ? rateMutation.variables.score : null}
                value={post.rating.userScore}
                onRate={(score) => {
                  setActionMessage(null);
                  rateMutation.mutate(
                    { postId: post.id, score },
                    {
                      onSuccess: () => {
                        pushToast({
                          title: '评分成功',
                          variant: 'success',
                        });
                      },
                      onError: (error) => {
                        setActionMessage(error instanceof Error ? error.message : '评分失败，请稍后重试');
                      },
                    }
                  );
                }}
              />
            </Card>

            <CommentComposer
              description="可回复同帖评论"
              draft={commentDraft}
              maxLength={maxCommentLength}
              pending={createCommentMutation.isPending}
              replyTarget={replyTarget}
              onCancelReply={() => setReplyTarget(null)}
              onDraftChange={setCommentDraft}
              onSubmit={() => void submitComment()}
            />

            {actionMessage ? (
              <div className="rounded-[1.05rem] bg-error-soft px-4 py-3 text-sm leading-6 text-error">
                {actionMessage}
              </div>
            ) : null}

            <CommentThread
              deletingCommentId={
                deleteCommentMutation.isPending
                  ? deleteCommentMutation.variables?.commentId ?? null
                  : null
              }
              errorMessage={commentsQuery.error instanceof Error ? commentsQuery.error.message : '请求失败'}
              hasNextPage={Boolean(commentsQuery.hasNextPage)}
              isFetchingNextPage={commentsQuery.isFetchingNextPage}
              isError={commentsQuery.isError}
              isLoading={commentsQuery.isLoading}
              items={comments.map((comment) => ({
                id: comment.id,
                parentCommentId: comment.parentCommentId,
                content: comment.content,
                avatarUrl: comment.avatarUrl,
                isMine: comment.isMine,
                authorLabel: comment.isMine ? '我的评论' : buildClassmateLabel(comment.author.label),
                createdAtLabel: formatPublishedAt(comment.createdAt),
              }))}
              onDelete={(commentId) => {
                setActionMessage(null);
                deleteCommentMutation.mutate(
                  { commentId },
                  {
                    onError: (error) => {
                      setActionMessage(error instanceof Error ? error.message : '删除评论失败，请稍后重试');
                    },
                  }
                );
              }}
              onLoadMore={() => void commentsQuery.fetchNextPage()}
              onReply={setReplyTarget}
            />

            <DeletePostButton
              busy={deleteMutation.isPending}
              onDelete={() => setDeleteConfirmOpen(true)}
              visible={post.isMine}
            />
          </>
        ) : null}
      </BottomSheet>

      <ConfirmSheet
        open={deleteConfirmOpen}
        busy={deleteMutation.isPending}
        description="删除后不可恢复。"
        title="确认删除这条帖子？"
        confirmLabel="确认删除"
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
