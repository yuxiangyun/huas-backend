/**
 * [INPUT]: 依赖 Treehole 查询/写入、私有多图轮播、按需全屏查看器、可折叠评论线程与短任务弹层
 * [OUTPUT]: 对外提供 TreeholeDetailSheet，以邻近图片、首批 20 条评论和固定底部输入器编排阅读与互动
 * [POS]: widgets/treehole-detail-sheet 的图文阅读容器，以帖子身份约束异步反馈，把媒体/评论请求窗口与输入器位置约束在小流量场景
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Heart, Send, Share2 } from 'lucide-react';
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
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { ActionMenu } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
import { PrivateMediaImage } from '@/shared/ui/private-media-image';
import type { ImageViewerRenderContext } from '@/shared/ui/image-viewer';
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

export function TreeholeDetailSheet({ postId, onClose, onMessageAuthor, onOpenProfile, onSharePost }: TreeholeDetailSheetProps) {
  const postQuery = useTreeholePostDetailQuery(postId);
  const commentsQuery = useTreeholeInfiniteCommentsQuery(postId, { pageSize: 20 });
  const metaQuery = useTreeholeMetaQuery();
  const likeMutation = useLikeTreeholePostMutation();
  const unlikeMutation = useUnlikeTreeholePostMutation();
  const createCommentMutation = useCreateTreeholeCommentMutation();
  const deleteCommentMutation = useDeleteTreeholeCommentMutation();
  const deletePostMutation = useDeleteTreeholePostMutation();
  const [commentDraft, setCommentDraft] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<CommentReplyTarget | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [imageViewerRequested, setImageViewerRequested] = useState(false);
  const activePostIdRef = useRef(postId);
  const post = postQuery.data;
  const comments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const maxCommentLength = metaQuery.data?.limits.maxCommentLength ?? 200;
  const likeBusy = likeMutation.isPending || unlikeMutation.isPending;

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
      if (post.viewer.liked) {
        await unlikeMutation.mutateAsync({ postId: requestedPostId });
      } else {
        await likeMutation.mutateAsync({ postId: requestedPostId });
      }
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

  return (
    <>
      <BottomSheet
        open={Boolean(postId)}
        closeLabel="关闭树洞详情"
        contentClassName="space-y-5"
        footer={post ? (
          <CommentComposer
            compact
            autoFocus={Boolean(replyTarget)}
            draft={commentDraft}
            maxLength={maxCommentLength}
            pending={createCommentMutation.isPending}
            replyTarget={replyTarget}
            onCancelReply={() => setReplyTarget(null)}
            onDraftChange={setCommentDraft}
            onSubmit={() => void submitComment()}
          />
        ) : undefined}
        onClose={onClose}
      >
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
            <p className="text-sm text-error">加载失败，请重试</p>
          </div>
          <Button size="xs" type="button" variant="subtle" onClick={onClose}>
            关闭
          </Button>
        </div>
      ) : null}

      {post ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <button className="flex items-center gap-2 rounded-[0.375rem] text-left hover:opacity-70" type="button" onClick={() => onOpenProfile(post.author.id)}>
                <CommunityAvatar className="size-7 rounded-full text-[0.65rem]" src={post.author.avatarUrl} />
                <span className="max-w-full truncate text-sm font-medium">
                  {post.author.displayName}
                </span>
              </button>
              <p className="text-xs text-muted">{formatPublishedAt(post.publishedAt)}</p>
            </div>

            <Button size="xs" type="button" variant="subtle" onClick={onClose}>
              关闭
            </Button>
          </div>

          {post.images.length > 0 ? (
            <TreeholeMediaCarousel
              alt={`${post.author.displayName} 发布的图片`}
              images={post.images}
              onOpenImage={setActiveImageIndex}
            />
          ) : null}

          <Card className="space-y-4">
            <p className="break-words text-[0.98rem] leading-7 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{post.content}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>{post.stats.likeCount} 个赞</span>
              <span>{post.stats.commentCount} 条评论</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-w-[6rem]"
                disabled={likeBusy || post.viewer.isMine}
                size="sm"
                type="button"
                variant={post.viewer.liked ? 'subtle' : 'secondary'}
                onClick={() => void handleToggleLike()}
              >
                <Heart aria-hidden="true" className="size-4" fill={post.viewer.liked ? 'currentColor' : 'none'} />
                {likeBusy ? '处理中…' : post.viewer.liked ? '已赞' : '点赞'}
              </Button>
              {!post.viewer.isMine ? (
                <Button size="sm" type="button" variant="secondary" onClick={() => onMessageAuthor(post.author.id)}>
                  <Send aria-hidden="true" className="size-4" />
                  私信
                </Button>
              ) : null}
              <Button size="sm" type="button" variant="secondary" onClick={() => onSharePost(post)}>
                <Share2 aria-hidden="true" className="size-4" />
                分享
              </Button>
              {post.viewer.isMine ? (
                <ActionMenu items={[{
                  label: '删除',
                  disabled: deletePostMutation.isPending,
                  tone: 'danger',
                  onSelect: () => setDeleteConfirmOpen(true),
                }]} />
              ) : null}
            </div>
          </Card>

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
                }
              );
            }}
            onLoadMore={() => void commentsQuery.fetchNextPage()}
            onReply={(target) => {
              setReplyTarget(target);
            }}
          />

          {actionMessage ? (
            <div className="rounded-[1.05rem] bg-error-soft px-4 py-3 text-sm leading-6 text-error">
              {actionMessage}
            </div>
          ) : null}

        </>
      ) : null}

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
