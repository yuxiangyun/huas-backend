import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import { useDiscoverPostDetailQuery, useDeleteDiscoverPostMutation, useRateDiscoverPostMutation } from '@/entities/discover/api/discover-queries';
import { DeletePostButton } from '@/features/discover-delete-post/ui/delete-post-button';
import { RatingStrip } from '@/features/discover-rate-post/ui/rating-strip';
import { buildMediaUrl } from '@/shared/api/media';
import { buildClassmateLabel } from '@/shared/lib/student';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ImageViewer } from '@/shared/ui/image-viewer';

interface DiscoverDetailSheetProps {
  postId: number | null;
  onClose: () => void;
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
    <AnimatePresence>
      {postId ? (
        <>
          <motion.button
            aria-label="关闭详情"
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[430px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            initial={{ y: '100%', opacity: 0.8 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <Card className="rounded-[2rem] bg-card-strong p-6">
              {postQuery.isLoading ? (
                <div className="space-y-4">
                  <div className="h-6 w-1/2 animate-pulse rounded bg-shell-strong" />
                  <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: 3 }, (_, index) => (
                      <div
                        key={index}
                        className="aspect-[3/4] animate-pulse rounded-[1.4rem] bg-shell-strong"
                      />
                    ))}
                  </div>
                  <div className="h-20 animate-pulse rounded-[1.4rem] bg-shell-strong" />
                </div>
              ) : null}

              {postQuery.isError ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-lg font-semibold text-ink">帖子加载失败</p>
                    <Button size="sm" type="button" variant="ghost" onClick={onClose}>
                      关闭
                    </Button>
                  </div>
                  <p className="text-sm leading-6 text-muted">
                    {postQuery.error instanceof Error ? postQuery.error.message : '请求失败'}
                  </p>
                </div>
              ) : null}

              {post ? (
                <>
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-pill bg-tint-soft px-3 py-1 text-xs font-medium text-[#7e3925]">
                          {post.category}
                        </span>
                        {post.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-pill bg-white px-3 py-1 text-xs text-muted ring-1 ring-line"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <h3 className="text-xl font-semibold text-ink">
                        {post.title || `${post.category} · 同学推荐`}
                      </h3>
                      <p className="text-sm leading-6 text-muted">
                        作者：{buildClassmateLabel(post.author.label)} · {new Date(post.publishedAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <Button size="sm" type="button" variant="ghost" onClick={onClose}>
                      关闭
                    </Button>
                  </div>

                  <div className="mb-5 grid grid-cols-3 gap-3">
                    {post.images.map((image, imageIndex) => (
                      <button
                        key={image.url}
                        className="overflow-hidden rounded-[1.4rem]"
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

                  <div className="space-y-5">
                    <Card className="space-y-2 rounded-[1.4rem] bg-white/80 p-4 shadow-none">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-ink">帖子评分</p>
                        <span className="text-sm text-muted">
                          {post.rating.average.toFixed(1)} 分 · {post.rating.count} 人
                        </span>
                      </div>
                      <p className="text-sm leading-6 text-muted">
                        {post.isMine
                          ? '自己的帖子不能评分，但可以查看实时评分结果。'
                          : post.rating.userScore
                            ? `你给了 ${post.rating.userScore} 分，再次评分会自动更新。`
                            : '选择 1-5 分即可提交评分。'}
                      </p>
                    </Card>

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

                    {actionMessage ? (
                      <div className="rounded-[1.25rem] bg-tint-soft px-4 py-3 text-sm leading-6 text-[#7e3925]">
                        {actionMessage}
                      </div>
                    ) : null}

                    <DeletePostButton
                      busy={deleteMutation.isPending}
                      onDelete={handleDelete}
                      visible={post.isMine}
                    />
                  </div>
                </>
              ) : null}
            </Card>
          </motion.div>

          <ImageViewer
            index={activeImageIndex}
            items={imageItems}
            onClose={() => setActiveImageIndex(null)}
            onIndexChange={setActiveImageIndex}
          />
        </>
      ) : null}
    </AnimatePresence>
  );
}
