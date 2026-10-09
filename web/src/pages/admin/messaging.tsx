/**
 * [INPUT]: 依赖后台 Cookie 会话、Messaging 只读查询、全局消息 ID 游标、URL 状态与私有媒体缓存
 * [OUTPUT]: 提供 HeroUI 私信浏览页，在会话列表与消息双栏中隔离增量状态、追赶新消息并保留历史阅读位置
 * [POS]: pages/admin 的私信管理入口，仅显示 Community 公共资料，不提供用户阅读状态或消息写操作
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar } from '@heroui/react/avatar';
import { Button } from '@heroui/react/button';
import { ListBox } from '@heroui/react/list-box';
import {
  useAdminMessagingConversationChangesQuery,
  useAdminMessagingConversationsQuery,
  useAdminMessagingMessageChangesQuery,
  useAdminMessagingMessagesInfiniteQuery,
} from '@/entities/admin/api/admin-queries';
import type { AdminMessagingConversation } from '@/entities/admin/model/admin-types';
import type { CommunityProfile } from '@/entities/community/model/community-types';
import type { Message, MessageImage } from '@/entities/messaging/model/messaging-types';
import type { AdminSession } from '@/features/admin-treehole/model/admin-session';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { ApiError } from '@/shared/api/http-client';
import { buildMediaUrl } from '@/shared/api/media';
import { AdminModal, AdminPage, AdminPagination, AdminPanel, AdminState } from '@/shared/ui/admin';
import { DeferredPrivateMediaImage, PrivateMediaImage } from '@/shared/ui/private-media-image';
import {
  CONVERSATION_PAGE_SIZE,
  latestConversationMessageId,
  mergeAdminConversations,
  mergeAdminMessages,
  messagePreview,
  messagingPage,
  messagingPositiveInt,
} from './admin-messaging-state';

const timestampFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

function PublicAvatar({ profile }: { profile: CommunityProfile }) {
  return (
    <Avatar className="size-8 shrink-0" size="sm">
      {profile.avatarUrl ? <Avatar.Image alt="" loading="lazy" src={buildMediaUrl(profile.avatarUrl)} /> : null}
      <Avatar.Fallback>{profile.displayName.slice(0, 1)}</Avatar.Fallback>
    </Avatar>
  );
}

function RefreshButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Button aria-label={label} isDisabled={busy} size="sm" variant="tertiary" onPress={onPress}>
      刷新
    </Button>
  );
}

function RefreshError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (!error) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm" role="alert">
      <span className="min-w-0 flex-1 text-danger [overflow-wrap:anywhere]">{error instanceof Error ? error.message : '刷新失败'}</span>
      <Button size="sm" variant="tertiary" onPress={onRetry}>重试</Button>
    </div>
  );
}

interface ConversationRowsProps {
  session: AdminSession | null;
  base: AdminMessagingConversation[];
  live: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function ConversationRows({ session, base, live, selectedId, onSelect }: ConversationRowsProps) {
  const [watermark, setWatermark] = useState(() => latestConversationMessageId(base));
  const [changes, setChanges] = useState(() => new Map<number, AdminMessagingConversation>());
  const changesQuery = useAdminMessagingConversationChangesQuery(live ? session : null, watermark);
  const conversations = useMemo(() => mergeAdminConversations(base, changes), [base, changes]);

  useEffect(() => {
    const data = changesQuery.data;
    if (!live || !data) return;
    if (data.items.length > 0) {
      setChanges((current) => {
        const next = new Map(current);
        for (const conversation of data.items) {
          if ((conversation.lastMessage?.id ?? 0) >= (next.get(conversation.id)?.lastMessage?.id ?? 0)) {
            next.set(conversation.id, conversation);
          }
        }
        return new Map(mergeAdminConversations([], next).map((conversation) => [conversation.id, conversation]));
      });
    }
    // A changed cursor requests the next batch immediately; a stationary cursor polls normally.
    setWatermark((current) => Math.max(current, data.afterMessageId));
  }, [changesQuery.data, live]);

  return (
    <>
      <RefreshError error={live ? changesQuery.error : null} onRetry={() => { void changesQuery.refetch(); }} />
      <AdminState empty={conversations.length === 0} emptyText="暂无会话" />
      {conversations.length > 0 ? (
        <ListBox
          aria-label="私信会话"
          className="max-h-[max(10rem,calc(100dvh-14rem))] gap-0 overflow-y-auto p-0"
          items={conversations}
          selectionMode="single"
          selectedKeys={conversations.some((item) => item.id === selectedId) ? [selectedId!] : []}
          onSelectionChange={(keys) => {
            if (keys === 'all') return;
            const id = messagingPositiveInt(String([...keys][0] ?? ''));
            if (id !== null) onSelect(id);
          }}
        >
          {(conversation) => (
            <ListBox.Item className="block px-3 py-3" id={conversation.id} textValue={`${conversation.participants.map((item) => item.displayName).join('、')} ${messagePreview(conversation.lastMessage)}`}>
              <span className="flex items-center gap-3">
                <span className="flex -space-x-2">
                  {conversation.participants.map((participant) => <PublicAvatar key={participant.id} profile={participant} />)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{conversation.participants.map((item) => item.displayName).join('、')}</span>
                  <span className="mt-1 block truncate text-xs text-muted">{messagePreview(conversation.lastMessage)}</span>
                </span>
              </span>
              <time className="mt-2 block text-right text-[11px] text-muted" dateTime={conversation.updatedAt}>{timestampFormatter.format(new Date(conversation.updatedAt))}</time>
            </ListBox.Item>
          )}
        </ListBox>
      ) : null}
    </>
  );
}

interface ScrollAnchor {
  id: string;
  offset: number;
  pageCount: number;
}

interface MessagePaneProps {
  session: AdminSession | null;
  conversationId: number;
  conversation: AdminMessagingConversation | null;
  onClose: () => void;
}

function MessagePane({ session, conversationId, conversation, onClose }: MessagePaneProps) {
  const messagesQuery = useAdminMessagingMessagesInfiniteQuery(session, conversationId);
  const [watermark, setWatermark] = useState<number | null>(null);
  const [retainedMessages, setRetainedMessages] = useState(() => new Map<number, Message>());
  const [image, setImage] = useState<MessageImage | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const initialScrollRef = useRef(false);
  const nearBottomRef = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const baseMessages = useMemo(() => messagesQuery.data?.pages.flatMap((page) => page.items) ?? [], [messagesQuery.data]);
  const messages = useMemo(() => mergeAdminMessages(baseMessages, retainedMessages), [baseMessages, retainedMessages]);
  const pageCount = messagesQuery.data?.pages.length ?? 0;
  const missing = messagesQuery.error instanceof ApiError && messagesQuery.error.httpStatus === 404;
  const changesQuery = useAdminMessagingMessageChangesQuery(missing ? null : session, conversationId, watermark);

  useEffect(() => {
    if (watermark !== null || !messagesQuery.data) return;
    // Only the first latest page establishes the cursor. Older pages and refetches cannot skip a gap.
    const latestId = messagesQuery.data.pages[0]?.afterMessageId;
    if (latestId !== undefined && latestId !== null && latestId > 0) setWatermark(latestId);
  }, [messagesQuery.data, watermark]);

  useEffect(() => {
    if (baseMessages.length === 0) return;
    // A new latest snapshot may move beyond the current viewport. Keep every loaded immutable message.
    setRetainedMessages((current) => {
      const next = new Map(current);
      baseMessages.forEach((message) => next.set(message.id, message));
      return next;
    });
  }, [baseMessages]);

  useEffect(() => {
    const data = changesQuery.data;
    if (!data || data.conversationId !== conversationId) return;
    if (data.items.length > 0) {
      setRetainedMessages((current) => {
        const next = new Map(current);
        data.items.forEach((message) => next.set(message.id, message));
        return next;
      });
    }
    const nextWatermark = data.afterMessageId;
    if (nextWatermark !== null) {
      setWatermark((current) => Math.max(current ?? 0, nextWatermark));
    }
  }, [changesQuery.data, conversationId]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || messages.length === 0) return;
    const anchor = anchorRef.current;
    if (anchor && pageCount > anchor.pageCount) {
      const element = viewport.querySelector<HTMLElement>(`[data-message-id="${anchor.id}"]`);
      if (element) viewport.scrollTop += element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchor.offset;
      anchorRef.current = null;
    } else if (!initialScrollRef.current || (nearBottomRef.current && anchor === null)) {
      viewport.scrollTop = viewport.scrollHeight;
      initialScrollRef.current = true;
    }
    setShowLatest(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 80);
  }, [messages, pageCount]);

  const loadOlder = () => {
    const viewport = viewportRef.current;
    if (!viewport || messagesQuery.isFetching || !messagesQuery.hasNextPage) return;
    const top = viewport.getBoundingClientRect().top;
    const firstVisible = [...viewport.querySelectorAll<HTMLElement>('[data-message-id]')]
      .find((element) => element.getBoundingClientRect().bottom > top);
    if (firstVisible?.dataset.messageId) {
      anchorRef.current = { id: firstVisible.dataset.messageId, offset: firstVisible.getBoundingClientRect().top - top, pageCount };
    }
    nearBottomRef.current = false;
    void messagesQuery.fetchNextPage().then((result) => {
      if (result.isFetchNextPageError) anchorRef.current = null;
    });
  };

  const title = conversation?.participants.map((participant) => participant.displayName).join('、') ?? `会话 #${conversationId}`;
  return (
    <AdminPanel
      className="flex h-[max(12rem,calc(100dvh-10.5rem))] min-w-0 flex-col space-y-0 lg:h-[max(12rem,calc(100dvh-8rem))] lg:pl-6"
      title={title}
      actions={(
        <div className="flex shrink-0 gap-1">
          <RefreshButton label="刷新消息" busy={messagesQuery.isFetching} onPress={() => { void messagesQuery.refetch(); }} />
          <Button aria-label="关闭会话" size="sm" variant="tertiary" onPress={onClose}>返回</Button>
        </div>
      )}
    >
      <AdminState loading={messagesQuery.isPending} error={!messagesQuery.data || missing ? messagesQuery.error : null} onRetry={() => { void messagesQuery.refetch(); }} />
      {!missing && messagesQuery.data ? (
        <>
          <RefreshError error={messagesQuery.error ?? changesQuery.error} onRetry={() => { void (messagesQuery.error ? messagesQuery.refetch() : changesQuery.refetch()); }} />
          <AdminState empty={messages.length === 0} emptyText="暂无消息" />
          <div
            ref={viewportRef}
            aria-label="会话消息"
            className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [overflow-anchor:none]"
            onScroll={(event) => {
              const viewport = event.currentTarget;
              const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 80;
              nearBottomRef.current = atBottom;
              setShowLatest(!atBottom);
            }}
          >
            {messagesQuery.hasNextPage ? (
              <div className="flex justify-center pb-4">
                <Button isDisabled={messagesQuery.isFetching} size="sm" variant="tertiary" onPress={loadOlder}>更早消息</Button>
              </div>
            ) : null}
            <div className="space-y-5">
              {messages.map((message) => (
                <article className="space-y-2" data-message-id={message.id} key={message.id}>
                  <header className="flex flex-wrap items-center gap-2">
                    <PublicAvatar profile={message.sender} />
                    <strong className="min-w-0 flex-1 truncate text-sm font-medium">{message.sender.displayName}</strong>
                    <time className="shrink-0 text-[11px] text-muted" dateTime={message.createdAt}>{timestampFormatter.format(new Date(message.createdAt))}</time>
                  </header>
                  {message.text ? <p className="text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p> : null}
                  {message.images.length > 0 ? (
                    <div className="grid max-w-lg grid-cols-2 gap-2 sm:grid-cols-3">
                      {message.images.map((item, index) => (
                        <Button
                          aria-label={`查看${message.sender.displayName}的第 ${index + 1} 张图片`}
                          className="block h-auto w-full min-w-0 overflow-hidden rounded-lg p-0"
                          key={item.id}
                          variant="tertiary"
                          onPress={() => setImage(item)}
                        >
                          <DeferredPrivateMediaImage alt="私信图片" authMode="admin" className="aspect-square w-full" rootRef={viewportRef} src={item.url} />
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
          {showLatest && messages.length > 0 ? (
            <div className="flex shrink-0 justify-end pt-3">
              <Button aria-label="跳到最新消息" size="sm" variant="secondary" onPress={() => {
                if (viewportRef.current) viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
                nearBottomRef.current = true;
                setShowLatest(false);
              }}>最新消息</Button>
            </div>
          ) : null}
        </>
      ) : null}
      <AdminModal isOpen={image !== null} onOpenChange={(open) => { if (!open) setImage(null); }} title="图片">
        {image ? <PrivateMediaImage alt="私信图片" authMode="admin" className="max-h-[70dvh] w-full object-contain" src={image.url} /> : null}
      </AdminModal>
    </AdminPanel>
  );
}

export function AdminMessagingPage() {
  const { session } = useAdminOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = messagingPage(searchParams.get('page'));
  const conversationId = messagingPositiveInt(searchParams.get('conversationId'));
  const conversationsQuery = useAdminMessagingConversationsQuery(session, { page, pageSize: CONVERSATION_PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil((conversationsQuery.data?.total ?? 0) / CONVERSATION_PAGE_SIZE));

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (next.has('page') && next.get('page') !== String(page)) {
      next.set('page', String(page));
      changed = true;
    }
    if (next.has('conversationId') && conversationId === null) {
      next.delete('conversationId');
      changed = true;
    }
    if (conversationsQuery.data && page > totalPages) {
      next.set('page', String(totalPages));
      changed = true;
    }
    if (changed) setSearchParams(next, { replace: true });
  }, [conversationId, conversationsQuery.data, page, searchParams, setSearchParams, totalPages]);

  const patchSearchParams = (patch: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    patch(next);
    setSearchParams(next);
  };

  const conversation = conversationsQuery.data?.items.find((item) => item.id === conversationId) ?? null;
  return (
    <AdminPage title="私信" actions={<RefreshButton label="刷新会话" busy={conversationsQuery.isFetching} onPress={() => { void conversationsQuery.refetch(); }} />}>
      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)] lg:gap-0">
        <AdminPanel className={`min-w-0 lg:border-r lg:border-separator lg:pr-5 ${conversationId !== null ? 'hidden lg:block' : ''}`}>
          <AdminState loading={conversationsQuery.isPending} error={!conversationsQuery.data ? conversationsQuery.error : null} onRetry={() => { void conversationsQuery.refetch(); }} />
          {conversationsQuery.data ? (
            <div className="space-y-4">
              <RefreshError error={conversationsQuery.error} onRetry={() => { void conversationsQuery.refetch(); }} />
              <ConversationRows
                // Every refreshed offset snapshot owns a fresh accumulator. A prior page cannot leak into it.
                key={`${page}:${conversationsQuery.dataUpdatedAt}`}
                session={session}
                base={conversationsQuery.data.items}
                live={page === 1}
                selectedId={conversationId}
                onSelect={(id) => patchSearchParams((params) => params.set('conversationId', String(id)))}
              />
              <AdminPagination isPending={conversationsQuery.isFetching} page={page} pageSize={CONVERSATION_PAGE_SIZE} total={conversationsQuery.data.total} onPageChange={(next) => patchSearchParams((params) => params.set('page', String(next)))} />
            </div>
          ) : null}
        </AdminPanel>
        {conversationId !== null ? (
          <MessagePane key={conversationId} session={session} conversationId={conversationId} conversation={conversation} onClose={() => patchSearchParams((params) => params.delete('conversationId'))} />
        ) : <div className="hidden min-h-64 place-items-center lg:grid"><AdminState empty emptyText="选择会话" /></div>}
      </div>
    </AdminPage>
  );
}
