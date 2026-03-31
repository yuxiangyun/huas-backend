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
import { TreeholeAvatar } from '@/shared/ui/treehole-avatar';

const loadImageViewer = () => import('@/shared/ui/image-viewer');

const LazyImageViewer = lazy(async () => {
  const module = await loadImageViewer();
  return { default: module.ImageViewer };
});

interface DiscoverDetailSheetProps {
  postId: number | null;
  onClose: () => void;
}

interface ReplyTarget {
  id: number;
  preview: string;
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
  const commentPreviewById = new Map(comments.map((item) => [item.id, item.content]));
  const maxCommentLength = metaQuery.data?.limits.maxCommentLength ?? 200;
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [imageViewerRequested, setImageViewerRequested] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
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

            <Card className="space-y-3 rounded-[1.3rem] bg-white/78 shadow-none">
              <div className="space-y-1">
                <p className="text-base font-semibold text-ink">评论</p>
                <p className="text-sm leading-6 text-muted">
                  可回复同帖评论
                </p>
              </div>

              {replyTarget ? (
                <div className="flex items-center justify-between gap-3 rounded-[1rem] bg-tint-soft px-3 py-2 text-xs text-ink">
                  <span className="text-clamp-1">
                    正在回复 #{replyTarget.id}：{replyTarget.preview}
                  </span>
                  <Button size="xs" type="button" variant="ghost" onClick={() => setReplyTarget(null)}>
                    取消
                  </Button>
                </div>
              ) : null}

              <label className="block space-y-2">
                <textarea
                  className="min-h-24 w-full rounded-[1.05rem] border border-line bg-white/80 px-3.5 py-3 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
                  maxLength={maxCommentLength}
                  placeholder={replyTarget ? `回复 #${replyTarget.id}` : '写评论'}
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                />
                <div className="flex items-center justify-between gap-3 text-xs text-muted">
                  <span>上限 {maxCommentLength} 字</span>
                  <span>{commentDraft.length} / {maxCommentLength}</span>
                </div>
              </label>

              <div className="flex justify-end">
                <Button
                  className="min-w-[6rem]"
                  disabled={createCommentMutation.isPending}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => void submitComment()}
                >
                  {createCommentMutation.isPending ? '发送中...' : '发送评论'}
                </Button>
              </div>
            </Card>

            {actionMessage ? (
              <div className="rounded-[1.05rem] bg-error-soft px-4 py-3 text-sm leading-6 text-error">
                {actionMessage}
              </div>
            ) : null}

            {commentsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }, (_, index) => (
                  <Card key={index} className="space-y-2 rounded-[1.2rem] bg-white/72 shadow-none">
                    <div className="flex items-start gap-3">
                      <div className="size-10 animate-pulse rounded-[0.8rem] bg-shell-strong" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-24 animate-pulse rounded bg-shell-strong" />
                        <div className="h-16 animate-pulse rounded-[1rem] bg-shell-strong" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : null}

            {commentsQuery.isError ? (
              <Card className="space-y-2 rounded-[1.2rem] bg-white/72 shadow-none">
                <p className="text-base font-semibold text-ink">评论加载失败</p>
                <p className="text-sm leading-6 text-muted">
                  {commentsQuery.error instanceof Error ? commentsQuery.error.message : '请求失败'}
                </p>
              </Card>
            ) : null}

            {!commentsQuery.isLoading && !commentsQuery.isError && comments.length === 0 ? (
              <Card className="space-y-2 rounded-[1.2rem] bg-white/72 shadow-none">
                <p className="text-base font-semibold text-ink">还没有评论</p>
                <p className="text-sm leading-6 text-muted">
                  写第一条
                </p>
              </Card>
            ) : null}

            {!commentsQuery.isLoading && !commentsQuery.isError && comments.length > 0 ? (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <Card key={comment.id} className="space-y-3 rounded-[1.2rem] bg-white/72 shadow-none">
                    <div className="flex items-start gap-3">
                      <TreeholeAvatar src={comment.avatarUrl} />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span className="rounded-pill bg-white px-3 py-1 ring-1 ring-line">
                              {comment.isMine ? '我的评论' : buildClassmateLabel(comment.author.label)}
                            </span>
                            <span>{formatPublishedAt(comment.createdAt)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="xs"
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setReplyTarget({
                                  id: comment.id,
                                  preview: comment.content.length > 20 ? `${comment.content.slice(0, 20)}...` : comment.content,
                                });
                              }}
                            >
                              回复
                            </Button>
                            {comment.isMine ? (
                              <Button
                                disabled={
                                  deleteCommentMutation.isPending
                                  && deleteCommentMutation.variables?.commentId === comment.id
                                }
                                size="xs"
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setActionMessage(null);
                                  deleteCommentMutation.mutate(
                                    { commentId: comment.id },
                                    {
                                      onError: (error) => {
                                        setActionMessage(
                                          error instanceof Error ? error.message : '删除评论失败，请稍后重试'
                                        );
                                      },
                                    }
                                  );
                                }}
                              >
                                删除
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {comment.parentCommentId ? (
                          <div className="rounded-[0.9rem] bg-white/80 px-3 py-2 text-xs leading-5 text-muted ring-1 ring-line">
                            回复 #{comment.parentCommentId}
                            {commentPreviewById.get(comment.parentCommentId)
                              ? `：${commentPreviewById.get(comment.parentCommentId)}`
                              : ''}
                          </div>
                        ) : null}
                        <p className="text-sm leading-7 whitespace-pre-wrap text-ink">{comment.content}</p>
                      </div>
                    </div>
                  </Card>
                ))}

                <div className="flex justify-end">
                  {commentsQuery.hasNextPage ? (
                    <Button
                      className="min-w-[6rem]"
                      disabled={commentsQuery.isFetchingNextPage}
                      size="sm"
                      type="button"
                      variant="secondary"
                      onClick={() => void commentsQuery.fetchNextPage()}
                    >
                      {commentsQuery.isFetchingNextPage ? '加载中...' : '更多评论'}
                    </Button>
                  ) : (
                    <span className="text-sm text-muted">评论已经到底了</span>
                  )}
                </div>
              </div>
            ) : null}

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
