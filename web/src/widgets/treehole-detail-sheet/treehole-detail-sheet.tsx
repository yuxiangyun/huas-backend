/**
 * [INPUT]: 依赖 Treehole 查询/写入 hooks、共享评论线程、BottomSheet、ConfirmSheet 与 TreeholeAvatar
 * [OUTPUT]: 对外提供 TreeholeDetailSheet，展示树洞详情并编排点赞、评论与删除
 * [POS]: widgets/treehole-detail-sheet 的业务容器，保留匿名社区数据与 mutation 语义，复用无请求评论 UI
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

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
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';
import { TreeholeAvatar } from '@/shared/ui/treehole-avatar';
import {
  CommentComposer,
  CommentThread,
  type CommentReplyTarget,
} from '@/widgets/comment-thread/comment-thread';

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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<CommentReplyTarget | null>(null);
  const post = postQuery.data;
  const comments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const maxCommentLength = metaQuery.data?.limits.maxCommentLength ?? 200;
  const likeBusy = likeMutation.isPending || unlikeMutation.isPending;

  useEffect(() => {
    setCommentDraft('');
    setActionMessage(null);
    setDeleteConfirmOpen(false);
    setReplyTarget(null);
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

    try {
      setActionMessage(null);
      await deletePostMutation.mutateAsync({ postId });
      pushToast({
        title: '树洞已删除',
        variant: 'success',
      });
      setDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '删除失败，请稍后重试');
    }
  };

  return (
    <>
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
            <div className="flex items-start gap-3">
              <TreeholeAvatar src={post.avatarUrl} />
              <div className="min-w-0 flex-1 space-y-4">
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
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      {deletePostMutation.isPending ? '删除中...' : '删除'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>

          <CommentComposer
            description="默认匿名"
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
              authorLabel: comment.isMine ? '我的评论' : '匿名评论',
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
        </>
      ) : null}

      </BottomSheet>

      <ConfirmSheet
        open={deleteConfirmOpen}
        busy={deletePostMutation.isPending}
        description="删除后不可恢复。"
        title="确认删除这条树洞？"
        confirmLabel="确认删除"
        tone="danger"
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleDeletePost()}
      />
    </>
  );
}
