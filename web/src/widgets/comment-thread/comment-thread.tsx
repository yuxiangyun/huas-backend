/**
 * [INPUT]: 依赖 shared/ui 的 Button、Card、TreeholeAvatar 与调用方提供的评论状态/动作
 * [OUTPUT]: 对外提供可聚焦编辑器、默认折叠回复的嵌套评论树及分页尾部
 * [POS]: widgets 的跨社区评论交互组件，在客户端组织父子关系并复用回复、删除和分页动作
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ActionMenu } from '@/shared/ui/action-menu';
import { TreeholeAvatar } from '@/shared/ui/treehole-avatar';
import { cn } from '@/shared/lib/cn';

export interface CommentReplyTarget {
  id: number;
  authorLabel: string;
  preview: string;
}

export interface CommentThreadItem {
  id: number;
  parentCommentId: number | null;
  content: string;
  avatarUrl: string | null;
  avatarFallbackLabel?: string | null;
  isMine: boolean;
  authorLabel: string;
  createdAtLabel: string;
}

interface CommentComposerProps {
  draft: string;
  maxLength: number;
  pending: boolean;
  replyTarget: CommentReplyTarget | null;
  onCancelReply: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  autoFocus?: boolean;
  onCollapse?: () => void;
}

export function CommentComposer({
  draft,
  maxLength,
  pending,
  replyTarget,
  onCancelReply,
  onDraftChange,
  onSubmit,
  autoFocus = false,
  onCollapse,
}: CommentComposerProps) {
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold text-ink">评论</p>
        {onCollapse ? (
          <Button size="xs" type="button" variant="ghost" onClick={onCollapse}>
            收起
          </Button>
        ) : null}
      </div>

      {replyTarget ? (
        <div className="flex items-center justify-between gap-3 rounded-[0.625rem] bg-tint-soft px-3 py-2 text-xs text-ink">
          <span className="text-clamp-1">
            回复 {replyTarget.authorLabel}：{replyTarget.preview}
          </span>
          <Button size="xs" type="button" variant="ghost" onClick={onCancelReply}>
            取消
          </Button>
        </div>
      ) : null}

      <label className="block space-y-2">
        <textarea
          autoFocus={autoFocus}
          className="field-control min-h-24 resize-y"
          maxLength={maxLength}
          placeholder={replyTarget ? `回复 ${replyTarget.authorLabel}` : '写评论'}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
        />
      </label>

      <div className="flex justify-end">
        <Button
          className="min-w-[6rem]"
          disabled={pending || !draft.trim()}
          size="sm"
          type="button"
          variant="primary"
          onClick={onSubmit}
        >
          {pending ? '发送中…' : '发送'}
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
  endMessage?: string | null;
}

function CommentLoadingState() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 2 }, (_, index) => (
        <Card key={index} className="space-y-2">
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

function CommentMessage({ message }: { message: string }) {
  return (
    <Card>
      <p className="text-sm text-muted">{message}</p>
    </Card>
  );
}

interface CommentNode {
  item: CommentThreadItem;
  children: CommentNode[];
}

function createsCycle(
  nodeId: number,
  parentId: number,
  nodeById: Map<number, CommentNode>
) {
  const visited = new Set<number>();
  let currentId: number | null = parentId;

  while (currentId !== null) {
    if (currentId === nodeId || visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = nodeById.get(currentId)?.item.parentCommentId ?? null;
  }

  return false;
}

function buildCommentForest(items: CommentThreadItem[]) {
  const nodeById = new Map<number, CommentNode>();
  for (const item of items) {
    nodeById.set(item.id, { item, children: [] });
  }

  const roots: CommentNode[] = [];
  for (const node of nodeById.values()) {
    const parentId = node.item.parentCommentId;
    const parent = parentId === null ? null : nodeById.get(parentId);
    if (!parent || createsCycle(node.item.id, parent.item.id, nodeById)) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  return roots;
}

function countReplies(node: CommentNode): number {
  return node.children.reduce(
    (total, child) => total + 1 + countReplies(child),
    0
  );
}

function replyTargetOf(item: CommentThreadItem): CommentReplyTarget {
  return {
    id: item.id,
    authorLabel: item.authorLabel,
    preview: item.content.length > 20 ? `${item.content.slice(0, 20)}…` : item.content,
  };
}

function CommentHeader({
  item,
  deleting,
  onDelete,
  onReply,
  compact = false,
}: {
  item: CommentThreadItem;
  deleting: boolean;
  onDelete: (commentId: number) => void;
  onReply: (target: CommentReplyTarget) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
        <TreeholeAvatar
          className={cn('rounded-full text-[0.65rem]', compact ? 'size-5' : 'size-6')}
          fallbackLabel={item.avatarFallbackLabel}
          src={item.avatarUrl}
        />
        <span className="max-w-full truncate font-medium text-ink">
          {item.authorLabel}
        </span>
        {item.isMine ? <span>· 我</span> : null}
        <span>{item.createdAtLabel}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="xs" type="button" variant="ghost" onClick={() => onReply(replyTargetOf(item))}>
          回复
        </Button>
        {item.isMine ? <ActionMenu items={[{ label: '删除', disabled: deleting, tone: 'danger', onSelect: () => onDelete(item.id) }]} /> : null}
      </div>
    </div>
  );
}

function ReplyBranch({ node, depth, deletingCommentId, onDelete, onReply }: {
  node: CommentNode;
  depth: number;
  deletingCommentId: number | null;
  onDelete: (commentId: number) => void;
  onReply: (target: CommentReplyTarget) => void;
}) {
  return (
    <div className={cn('py-3', depth > 1 && 'ml-4 border-l border-line pl-3')}>
      <CommentHeader
        compact
        deleting={deletingCommentId === node.item.id}
        item={node.item}
        onDelete={onDelete}
        onReply={onReply}
      />
      <p className="mt-2 break-words text-sm leading-6 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
        {node.item.content}
      </p>
      {node.children.map((child) => (
        <ReplyBranch
          key={child.item.id}
          deletingCommentId={deletingCommentId}
          depth={depth + 1}
          node={child}
          onDelete={onDelete}
          onReply={onReply}
        />
      ))}
    </div>
  );
}

function CommentCard({
  node,
  deletingCommentId,
  expanded,
  onDelete,
  onReply,
  onToggleReplies,
}: {
  node: CommentNode;
  deletingCommentId: number | null;
  expanded: boolean;
  onDelete: (commentId: number) => void;
  onReply: (target: CommentReplyTarget) => void;
  onToggleReplies: () => void;
}) {
  const replyCount = countReplies(node);

  return (
    <Card className="space-y-3">
      <CommentHeader
        deleting={deletingCommentId === node.item.id}
        item={node.item}
        onDelete={onDelete}
        onReply={onReply}
      />
      <p className="break-words text-sm leading-7 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
        {node.item.content}
      </p>
      {replyCount > 0 ? (
        <Button
          aria-expanded={expanded}
          className="px-0"
          size="xs"
          type="button"
          variant="ghost"
          onClick={onToggleReplies}
        >
          {expanded ? '收起回复' : `${replyCount} 条回复`}
        </Button>
      ) : null}
      {expanded ? (
        <div className="divide-y divide-line border-t border-line">
          {node.children.map((child) => (
            <ReplyBranch
              key={child.item.id}
              deletingCommentId={deletingCommentId}
              depth={1}
              node={child}
              onDelete={onDelete}
              onReply={onReply}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function CommentPagination({
  hasNextPage,
  pending,
  onLoadMore,
  endMessage,
}: {
  hasNextPage: boolean;
  pending: boolean;
  onLoadMore: () => void;
  endMessage: string | null;
}) {
  if (!hasNextPage && !endMessage) return null;

  return (
    <div className="flex justify-end">
      {hasNextPage ? (
        <Button className="min-w-[6rem]" disabled={pending} size="sm" type="button" variant="secondary" onClick={onLoadMore}>
          {pending ? '加载中…' : '更多评论'}
        </Button>
      ) : null}
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
  endMessage,
}: Omit<CommentThreadProps, 'isLoading' | 'isError' | 'errorMessage'>) {
  const [expandedRootIds, setExpandedRootIds] = useState<Set<number>>(() => new Set());
  const roots = buildCommentForest(items);

  const toggleReplies = (commentId: number) => {
    setExpandedRootIds((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {roots.map((node) => (
        <CommentCard
          key={node.item.id}
          deletingCommentId={deletingCommentId}
          expanded={expandedRootIds.has(node.item.id)}
          node={node}
          onDelete={onDelete}
          onReply={onReply}
          onToggleReplies={() => toggleReplies(node.item.id)}
        />
      ))}
      <CommentPagination
        endMessage={endMessage ?? null}
        hasNextPage={hasNextPage}
        pending={isFetchingNextPage}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}

export function CommentThread({
  items,
  isLoading,
  isError,
  deletingCommentId,
  hasNextPage,
  isFetchingNextPage,
  onDelete,
  onLoadMore,
  onReply,
  endMessage = null,
}: CommentThreadProps) {
  return (
    <>
      {isLoading ? <CommentLoadingState /> : null}
      {isError ? <CommentMessage message="评论加载失败，请重试" /> : null}
      {!isLoading && !isError && items.length === 0 ? (
        <CommentMessage message="暂无评论" />
      ) : null}
      {!isLoading && !isError && items.length > 0 ? (
        <CommentList
          deletingCommentId={deletingCommentId}
          endMessage={endMessage}
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
