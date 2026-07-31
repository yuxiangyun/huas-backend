/**
 * [INPUT]: 依赖后台私信会话/消息分页与高水位查询、Cookie 私有媒体、后台会话上下文和 URL 状态
 * [OUTPUT]: 对外提供 AdminMessagingPage，以只读方式检查全部一对一会话、历史消息和图片
 * [POS]: pages/admin 的私信审计工作台，不提供发送、修改、删除或清空能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useAdminMessagingConversationChangesQuery,
  useAdminMessagingConversationsQuery,
  useAdminMessagingMessageChangesQuery,
  useAdminMessagingMessagesInfiniteQuery,
} from '@/entities/admin/api/admin-queries';
import type { AdminMessagingConversation } from '@/entities/admin/model/admin-types';
import type { Message } from '@/entities/messaging/model/messaging-types';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
import { EmptyState } from '@/shared/ui/empty-state';
import { PrivateMediaImage } from '@/shared/ui/private-media-image';

function positiveInt(value: string | null, fallback: number | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function messagePreview(message: Message | null) {
  if (!message) return '暂无消息';
  if (message.text) return message.text;
  return message.images.length > 1 ? `${message.images.length} 张图片` : '图片';
}

function mergeConversations(base: AdminMessagingConversation[], changes: ReadonlyMap<number, AdminMessagingConversation>) {
  const merged = new Map(base.map((conversation) => [conversation.id, conversation]));
  changes.forEach((conversation, id) => {
    const currentMessageId = merged.get(id)?.lastMessage?.id ?? 0;
    if ((conversation.lastMessage?.id ?? 0) >= currentMessageId) merged.set(id, conversation);
  });
  return [...merged.values()].sort((left, right) => {
    const byMessage = (right.lastMessage?.id ?? 0) - (left.lastMessage?.id ?? 0);
    return byMessage || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function mergeMessages(base: Message[], changes: ReadonlyMap<number, Message>) {
  const merged = new Map(base.map((message) => [message.id, message]));
  changes.forEach((message, id) => merged.set(id, message));
  return [...merged.values()].sort((left, right) => left.id - right.id);
}

export function AdminMessagingPage() {
  const { session } = useAdminOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = positiveInt(searchParams.get('page'), 1)!;
  const conversationId = positiveInt(searchParams.get('conversationId'), null);
  const conversationsQuery = useAdminMessagingConversationsQuery(session, { page, pageSize: 30 });
  const [conversationWatermark, setConversationWatermark] = useState<number | null>(null);
  const [conversationChanges, setConversationChanges] = useState<Map<number, AdminMessagingConversation>>(() => new Map());
  const conversationChangesQuery = useAdminMessagingConversationChangesQuery(page === 1 ? session : null, conversationWatermark);
  const baseConversations = conversationsQuery.data?.items ?? [];
  const conversations = useMemo(
    () => mergeConversations(baseConversations, conversationChanges),
    [baseConversations, conversationChanges]
  );

  const messagesQuery = useAdminMessagingMessagesInfiniteQuery(session, conversationId);
  const baseMessages = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    return [...pages].reverse().flatMap((item) => item.items);
  }, [messagesQuery.data]);
  const [messageWatermark, setMessageWatermark] = useState<number | null>(null);
  const [messageChanges, setMessageChanges] = useState<Map<number, Message>>(() => new Map());
  const messageChangesQuery = useAdminMessagingMessageChangesQuery(session, conversationId, messageWatermark);
  const messages = useMemo(() => mergeMessages(baseMessages, messageChanges), [baseMessages, messageChanges]);
  const selectedConversation = conversations.find((conversation) => conversation.id === conversationId) ?? null;
  const totalPages = Math.max(1, Math.ceil((conversationsQuery.data?.total ?? 0) / (conversationsQuery.data?.pageSize ?? 30)));

  useEffect(() => {
    setConversationChanges(new Map());
    setConversationWatermark(null);
  }, [page]);

  useEffect(() => {
    if (page !== 1 || !conversationsQuery.isSuccess || conversationWatermark !== null) return;
    setConversationWatermark(Math.max(0, ...baseConversations.map((conversation) => conversation.lastMessage?.id ?? 0)));
  }, [baseConversations, conversationWatermark, conversationsQuery.isSuccess, page]);

  useEffect(() => {
    const data = conversationChangesQuery.data;
    if (!data) return;
    if (data.items.length > 0) {
      setConversationChanges((current) => {
        const next = new Map(current);
        data.items.forEach((conversation) => next.set(conversation.id, conversation));
        return next;
      });
    }
    setConversationWatermark((current) => Math.max(current ?? 0, data.afterMessageId));
  }, [conversationChangesQuery.data]);

  useEffect(() => {
    setMessageChanges(new Map());
    setMessageWatermark(null);
  }, [conversationId]);

  useEffect(() => {
    if (conversationId === null || !messagesQuery.isSuccess || messageWatermark !== null) return;
    setMessageWatermark(Math.max(0, ...baseMessages.map((message) => message.id)));
  }, [baseMessages, conversationId, messageWatermark, messagesQuery.isSuccess]);

  useEffect(() => {
    const data = messageChangesQuery.data;
    if (!data) return;
    if (data.items.length > 0) {
      setMessageChanges((current) => {
        const next = new Map(current);
        data.items.forEach((message) => next.set(message.id, message));
        return next;
      });
    }
    setMessageWatermark((current) => Math.max(current ?? 0, data.afterMessageId ?? 0));
  }, [messageChangesQuery.data]);

  const patchSearchParams = (patcher: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    patcher(next);
    setSearchParams(next);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">私信审计</h1>
          <p className="mt-1 text-sm text-muted">只读访问；会话、消息和图片读取均写入后台审计日志。</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void conversationsQuery.refetch()}>刷新</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.15fr)]">
        <Card className="overflow-hidden bg-card-strong p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <strong className="text-sm">会话</strong>
            <span className="text-xs text-muted">{conversationsQuery.data?.total ?? 0} 条</span>
          </div>
          {conversationsQuery.isLoading ? <div className="h-48 animate-pulse bg-shell-strong" /> : null}
          {conversationsQuery.isError ? <EmptyState title="会话加载失败" /> : null}
          {!conversationsQuery.isLoading && !conversationsQuery.isError && conversations.length === 0 ? <EmptyState title="暂无会话" /> : null}
          <div className="divide-y divide-line">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`block w-full px-4 py-3 text-left hover:bg-tint-soft ${conversation.id === conversationId ? 'bg-tint-soft' : ''}`}
                type="button"
                onClick={() => patchSearchParams((params) => params.set('conversationId', String(conversation.id)))}
              >
                <span className="flex items-center gap-2">
                  <span className="flex -space-x-1.5">
                    {conversation.participants.map((participant) => <CommunityAvatar key={participant.id} className="size-7 border-2 border-white" src={participant.avatarUrl} />)}
                  </span>
                  <strong className="min-w-0 flex-1 truncate text-sm">{conversation.participants.map((participant) => participant.displayName).join(' ↔ ')}</strong>
                  <span className="shrink-0 font-mono text-xs text-muted">#{conversation.id}</span>
                </span>
                <span className="mt-2 flex items-center gap-3 text-xs text-muted">
                  <span className="text-clamp-1 min-w-0 flex-1">{messagePreview(conversation.lastMessage)}</span>
                  <time className="shrink-0">{formatDateTime(conversation.updatedAt)}</time>
                </span>
              </button>
            ))}
          </div>
          {conversationsQuery.data ? (
            <div className="flex items-center justify-between border-t border-line px-4 py-3">
              <Button disabled={page <= 1} size="sm" variant="secondary" onClick={() => patchSearchParams((params) => { params.set('page', String(page - 1)); params.delete('conversationId'); })}>上一页</Button>
              <span className="text-xs text-muted">{page} / {totalPages}</span>
              <Button disabled={!conversationsQuery.data.hasMore} size="sm" variant="secondary" onClick={() => patchSearchParams((params) => { params.set('page', String(page + 1)); params.delete('conversationId'); })}>下一页</Button>
            </div>
          ) : null}
        </Card>

        <Card className="overflow-hidden bg-card-strong p-0">
          <div className="border-b border-line px-4 py-3">
            <strong className="text-sm">消息</strong>
            <p className="mt-1 text-xs text-muted">{selectedConversation ? selectedConversation.participants.map((participant) => participant.displayName).join(' 与 ') : conversationId ? `会话 #${conversationId}` : '选择左侧会话'}</p>
          </div>
          {conversationId === null ? <EmptyState title="未选择会话" /> : messagesQuery.isLoading ? (
            <div className="h-64 animate-pulse bg-shell-strong" />
          ) : messagesQuery.isError ? (
            <EmptyState title="消息加载失败" />
          ) : messages.length === 0 ? (
            <EmptyState title="暂无消息" />
          ) : (
            <div className="max-h-[42rem] overflow-y-auto">
              {messagesQuery.hasNextPage ? <div className="flex justify-center border-b border-line px-4 py-3"><Button disabled={messagesQuery.isFetchingNextPage} size="sm" variant="ghost" onClick={() => void messagesQuery.fetchNextPage()}>{messagesQuery.isFetchingNextPage ? '加载中…' : '更早消息'}</Button></div> : null}
              <div className="divide-y divide-line">
                {messages.map((message) => (
                  <article key={message.id} className="space-y-2 px-4 py-3.5">
                    <header className="flex items-center gap-2 text-xs text-muted">
                      <CommunityAvatar className="size-6" src={message.sender.avatarUrl} />
                      <strong className="min-w-0 flex-1 truncate text-ink">{message.sender.displayName}</strong>
                      <span className="font-mono">#{message.id}</span>
                      <time>{formatDateTime(message.createdAt)}</time>
                    </header>
                    {message.text ? <p className="break-words text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p> : null}
                    {message.images.length > 0 ? (
                      <div className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-3">
                        {message.images.map((image) => <PrivateMediaImage key={image.id} alt="私信图片" authMode="admin" className="aspect-square w-full rounded-[0.5rem] border border-line object-cover" src={image.url} />)}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
