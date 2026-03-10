import { useEffect, useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import {
  useDeleteDiscoverPostMutation,
  useDiscoverPostDetailQuery,
  useRateDiscoverPostMutation,
} from '@/entities/discover/api/discover-queries';
import { DeletePostButton } from '@/features/discover-delete-post/ui/delete-post-button';
import { RatingStrip } from '@/features/discover-rate-post/ui/rating-strip';
import { buildMediaUrl } from '@/shared/api/media';
import { buildClassmateLabel } from '@/shared/lib/student';
import { Button } from '@/shared/ui/button';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Card } from '@/shared/ui/card';
import { ImageViewer } from '@/shared/ui/image-viewer';

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
  const rateMutation = useRateDiscoverPostMutation();
  const deleteMutation = useDeleteDiscoverPostMutation();
  const post = postQuery.data;
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const pushToast = useToastStore((state) => state.pushToast);

  useEffect(() => {
    setActionMessage(null);
    setActiveImageIndex(null);
  }, [postId]);

  const handleDelete = async () => {
    if (!postId) return;
    if (!window.confirm('确认删除这条帖子？删除后不可恢复。')) return;

    try {
      setActionMessage(null);
      await deleteMutation.mutateAsync({ postId });
      pushToast({
        title: '删除成功',
        message: '帖子已经从列表中移除。',
        variant: 'success',
      });
      onClose();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '删除失败，请稍后重试');
    }
  };

  const imageItems = post?.images.map((image, imageIndex) => ({
    src: buildMediaUrl(image.url),
    alt: `${post.title || `${post.category} · 同学推荐`} · 第 ${imageIndex + 1} 张`,
    key: image.url,
  })) ?? [];

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
                  <span className="rounded-pill bg-tint-soft px-3 py-1 text-xs font-medium text-[#7e3925]">
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
                  <p className="text-sm font-semibold text-ink">这顿饭值不值得去</p>
                  <span className="text-sm text-muted">
                    {post.rating.average.toFixed(1)} 分 · {post.rating.count} 人
                  </span>
                </div>
                <p className="text-sm leading-7 whitespace-pre-wrap text-muted">
                  {post.content || '这条旧帖子没有留下正文说明。'}
                </p>
              </Card>

              <Card className="space-y-3 rounded-[1.2rem] bg-white/78 p-3.5 shadow-none sm:rounded-[1.5rem] sm:p-4">
                <p className="text-sm font-semibold text-ink">关键信息</p>
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

            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {post.images.map((image, imageIndex) => (
                <button
                  key={image.url}
                  className="overflow-hidden rounded-[1.1rem] sm:rounded-[1.4rem]"
                  type="button"
                  onClick={() => setActiveImageIndex(imageIndex)}
                >
                  <img
                    alt={post.title || '帖子图片'}
                    className="aspect-[3/4] w-full object-cover"
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
                    ? '自己的帖子不能评分，但可以实时看到大家给出的反馈。'
                    : post.rating.userScore
                      ? `你已经打了 ${post.rating.userScore} 分，再次评分会自动更新。`
                      : '如果这条推荐对你有帮助，直接给 1-5 分。'}
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
                          message: `你给这条帖子打了 ${score} 分。`,
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

            {actionMessage ? (
              <div className="rounded-[1.05rem] bg-tint-soft px-4 py-3 text-sm leading-6 text-[#7e3925]">
                {actionMessage}
              </div>
            ) : null}

            <DeletePostButton
              busy={deleteMutation.isPending}
              onDelete={handleDelete}
              visible={post.isMine}
            />
          </>
        ) : null}
      </BottomSheet>

      <ImageViewer
        index={activeImageIndex}
        items={imageItems}
        onClose={() => setActiveImageIndex(null)}
        onIndexChange={setActiveImageIndex}
      />
    </>
  );
}
