/**
 * [INPUT]: 依赖 shared/ui 的 Button、Card、TreeholeAvatar 与调用方提供的评论状态/动作
 * [OUTPUT]: 对外提供 CommentComposer、CommentThread、CommentReplyTarget 与 CommentThreadItem
 * [POS]: widgets 的跨社区评论交互组件，复用编辑、回复、列表状态、删除和分页展示，不持有请求语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { TreeholeAvatar } from '@/shared/ui/treehole-avatar';

export interface CommentReplyTarget {
  id: number;
  preview: string;
}

export interface CommentThreadItem {
  id: number;
  parentCommentId: number | null;
  content: string;
  avatarUrl: string | null;
  isMine: boolean;
  authorLabel: string;
  createdAtLabel: string;
}

interface CommentComposerProps {
  description: string;
  draft: string;
  maxLength: number;
  pending: boolean;
  replyTarget: CommentReplyTarget | null;
  onCancelReply: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}

export function CommentComposer({
  description,
  draft,
  maxLength,
  pending,
  replyTarget,
  onCancelReply,
  onDraftChange,
  onSubmit,
}: CommentComposerProps) {
  return (
    <Card className="space-y-3 rounded-[1.3rem] bg-white/78 shadow-none">
      <div className="space-y-1">
        <p className="text-base font-semibold text-ink">评论</p>
        <p className="text-sm leading-6 text-muted">{description}</p>
      </div>

      {replyTarget ? (
        <div className="flex items-center justify-between gap-3 rounded-[1rem] bg-tint-soft px-3 py-2 text-xs text-ink">
          <span className="text-clamp-1">
            正在回复 #{replyTarget.id}：{replyTarget.preview}
          </span>
          <Button size="xs" type="button" variant="ghost" onClick={onCancelReply}>
            取消
          </Button>
        </div>
      ) : null}

      <label className="block space-y-2">
        <textarea
          className="min-h-24 w-full rounded-[1.05rem] border border-line bg-white/80 px-3.5 py-3 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
          maxLength={maxLength}
          placeholder={replyTarget ? `回复 #${replyTarget.id}` : '写评论'}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>上限 {maxLength} 字</span>
          <span>{draft.length} / {maxLength}</span>
        </div>
      </label>

      <div className="flex justify-end">
        <Button
          className="min-w-[6rem]"
          disabled={pending}
          size="sm"
          type="button"
          variant="secondary"
          onClick={onSubmit}
        >
          {pending ? '发送中...' : '发送评论'}
        </Button>
      </div>
    </Card>
  );
}

interface CommentThreadProps {
  items: CommentThreadItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  deletingCommentId: number | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onDelete: (commentId: number) => void;
  onLoadMore: () => void;
  onReply: (target: CommentReplyTarget) => void;
}

function CommentLoadingState() {
  return (
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
  );
}

function CommentMessage({ title, message }: { title: string; message: string }) {
  return (
    <Card className="space-y-2 rounded-[1.2rem] bg-white/72 shadow-none">
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="text-sm leading-6 text-muted">{message}</p>
    </Card>
  );
}

function CommentCard({
  item,
  parentContent,
  deleting,
  onDelete,
  onReply,
}: {
  item: CommentThreadItem;
  parentContent: string | undefined;
  deleting: boolean;
  onDelete: (commentId: number) => void;
  onReply: (target: CommentReplyTarget) => void;
}) {
  return (
    <Card className="space-y-3 rounded-[1.2rem] bg-white/72 shadow-none">
      <div className="flex items-start gap-3">
        <TreeholeAvatar src={item.avatarUrl} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-pill bg-white px-3 py-1 ring-1 ring-line">{item.authorLabel}</span>
              <span>{item.createdAtLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                type="button"
                variant="ghost"
                onClick={() => onReply({
                  id: item.id,
                  preview: item.content.length > 20 ? `${item.content.slice(0, 20)}...` : item.content,
                })}
              >
                回复
              </Button>
              {item.isMine ? (
                <Button disabled={deleting} size="xs" type="button" variant="ghost" onClick={() => onDelete(item.id)}>
                  删除
                </Button>
              ) : null}
            </div>
          </div>
          {item.parentCommentId ? (
            <div className="break-words rounded-[0.9rem] bg-white/80 px-3 py-2 text-xs leading-5 text-muted ring-1 ring-line [overflow-wrap:anywhere]">
              回复 #{item.parentCommentId}{parentContent ? `：${parentContent}` : ''}
            </div>
          ) : null}
          <p className="break-words text-sm leading-7 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{item.content}</p>
        </div>
      </div>
    </Card>
  );
}

function CommentPagination({
  hasNextPage,
  pending,
  onLoadMore,
}: {
  hasNextPage: boolean;
  pending: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex justify-end">
      {hasNextPage ? (
        <Button className="min-w-[6rem]" disabled={pending} size="sm" type="button" variant="secondary" onClick={onLoadMore}>
          {pending ? '加载中...' : '更多评论'}
        </Button>
      ) : (
        <span className="text-sm text-muted">评论已经到底了</span>
      )}
    </div>
  );
}

function CommentList({
  items,
  deletingCommentId,
  hasNextPage,
  isFetchingNextPage,
  onDelete,
  onLoadMore,
  onReply,
}: Omit<CommentThreadProps, 'isLoading' | 'isError' | 'errorMessage'>) {
  const contentById = new Map(items.map((item) => [item.id, item.content]));
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <CommentCard
          key={item.id}
          deleting={deletingCommentId === item.id}
          item={item}
          parentContent={item.parentCommentId ? contentById.get(item.parentCommentId) : undefined}
          onDelete={onDelete}
          onReply={onReply}
        />
      ))}
      <CommentPagination hasNextPage={hasNextPage} pending={isFetchingNextPage} onLoadMore={onLoadMore} />
    </div>
  );
}

export function CommentThread({
  items,
  isLoading,
  isError,
  errorMessage,
  deletingCommentId,
  hasNextPage,
  isFetchingNextPage,
  onDelete,
  onLoadMore,
  onReply,
}: CommentThreadProps) {
  return (
    <>
      {isLoading ? <CommentLoadingState /> : null}
      {isError ? <CommentMessage title="评论加载失败" message={errorMessage} /> : null}
      {!isLoading && !isError && items.length === 0 ? (
        <CommentMessage title="还没有评论" message="写第一条" />
      ) : null}
      {!isLoading && !isError && items.length > 0 ? (
        <CommentList
          deletingCommentId={deletingCommentId}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          items={items}
          onDelete={onDelete}
          onLoadMore={onLoadMore}
          onReply={onReply}
        />
      ) : null}
    </>
  );
}
