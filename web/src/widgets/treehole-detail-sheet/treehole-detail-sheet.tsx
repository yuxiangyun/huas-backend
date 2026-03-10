import { useEffect, useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
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
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

interface TreeholeDetailSheetProps {
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

export function TreeholeDetailSheet({ postId, onClose }: TreeholeDetailSheetProps) {
  const postQuery = useTreeholePostDetailQuery(postId);
  const commentsQuery = useTreeholeInfiniteCommentsQuery(postId, { pageSize: 50 });
  const metaQuery = useTreeholeMetaQuery();
  const likeMutation = useLikeTreeholePostMutation();
  const unlikeMutation = useUnlikeTreeholePostMutation();
  const createCommentMutation = useCreateTreeholeCommentMutation();
  const deleteCommentMutation = useDeleteTreeholeCommentMutation();
  const deletePostMutation = useDeleteTreeholePostMutation();
  const pushToast = useToastStore((state) => state.pushToast);
  const [commentDraft, setCommentDraft] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const post = postQuery.data;
  const comments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const maxCommentLength = metaQuery.data?.limits.maxCommentLength ?? 200;
  const likeBusy = likeMutation.isPending || unlikeMutation.isPending;

  useEffect(() => {
    setCommentDraft('');
    setActionMessage(null);
  }, [postId]);

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
      await createCommentMutation.mutateAsync({ postId, content });
      setCommentDraft('');
      pushToast({
        title: '评论已发送',
        variant: 'success',
      });
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '评论发送失败，请稍后重试');
    }
  };

  const handleToggleLike = async () => {
    if (!post) return;

    try {
      setActionMessage(null);
      if (post.viewer.liked) {
        await unlikeMutation.mutateAsync({ postId: post.id });
      } else {
        await likeMutation.mutateAsync({ postId: post.id });
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '操作失败，请稍后重试');
    }
  };

  const handleDeletePost = async () => {
    if (!postId) return;
    if (!window.confirm('确认删除这条树洞？删除后不可恢复')) return;

    try {
      setActionMessage(null);
      await deletePostMutation.mutateAsync({ postId });
      pushToast({
        title: '树洞已删除',
        variant: 'success',
      });
      onClose();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '删除失败，请稍后重试');
    }
  };

  return (
    <BottomSheet open={Boolean(postId)} closeLabel="关闭树洞详情" contentClassName="space-y-4" onClose={onClose}>
      {postQuery.isLoading ? (
        <div className="space-y-4">
          <div className="h-7 w-40 animate-pulse rounded bg-shell-strong" />
          <div className="h-32 animate-pulse rounded-[1.25rem] bg-shell-strong" />
          <div className="h-28 animate-pulse rounded-[1.25rem] bg-shell-strong" />
        </div>
      ) : null}

      {postQuery.isError ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-lg font-semibold text-ink">树洞加载失败</p>
            <p className="text-sm leading-6 text-muted">
              {postQuery.error instanceof Error ? postQuery.error.message : '请求失败'}
            </p>
          </div>
          <Button size="xs" type="button" variant="subtle" onClick={onClose}>
            关闭
          </Button>
        </div>
      ) : null}

      {post ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-pill bg-tint-soft px-3 py-1 text-xs font-medium text-ink">
                  匿名树洞
                </span>
                {post.viewer.isMine ? (
                  <span className="rounded-pill bg-white px-3 py-1 text-xs text-muted ring-1 ring-line">
                    我的
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted">发布于 {formatPublishedAt(post.publishedAt)}</p>
            </div>

            <Button size="xs" type="button" variant="subtle" onClick={onClose}>
              关闭
            </Button>
          </div>

          <Card className="space-y-4 rounded-[1.3rem] bg-white/78 shadow-none">
            <p className="text-sm leading-7 whitespace-pre-wrap text-ink">{post.content}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>{post.stats.likeCount} 个赞</span>
              <span>{post.stats.commentCount} 条评论</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-w-[6rem]"
                disabled={likeBusy}
                size="sm"
                type="button"
                variant={post.viewer.liked ? 'subtle' : 'secondary'}
                onClick={() => void handleToggleLike()}
              >
                {likeBusy ? '处理中...' : post.viewer.liked ? '取消点赞' : '点赞'}
              </Button>
              {post.viewer.isMine ? (
                <Button
                  className="min-w-[6rem]"
                  disabled={deletePostMutation.isPending}
                  size="sm"
                  type="button"
                  variant="danger"
                  onClick={() => void handleDeletePost()}
                >
                  {deletePostMutation.isPending ? '删除中...' : '删除'}
                </Button>
              ) : null}
            </div>
          </Card>

          <Card className="space-y-3 rounded-[1.3rem] bg-white/78 shadow-none">
            <div className="space-y-1">
              <p className="text-base font-semibold text-ink">评论</p>
              <p className="text-sm leading-6 text-muted">
                默认匿名
              </p>
            </div>

            <label className="block space-y-2">
              <textarea
                className="min-h-24 w-full rounded-[1.05rem] border border-line bg-white/80 px-3.5 py-3 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
                maxLength={maxCommentLength}
                placeholder="写评论"
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
                  <div className="h-4 w-24 animate-pulse rounded bg-shell-strong" />
                  <div className="h-16 animate-pulse rounded-[1rem] bg-shell-strong" />
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="rounded-pill bg-white px-3 py-1 ring-1 ring-line">
                        {comment.isMine ? '我的评论' : '匿名评论'}
                      </span>
                      <span>{formatPublishedAt(comment.createdAt)}</span>
                    </div>
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
                  <p className="text-sm leading-7 whitespace-pre-wrap text-ink">{comment.content}</p>
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
        </>
      ) : null}
    </BottomSheet>
  );
}
