/**
 * [INPUT]: 依赖 Messaging/Notifications 分页、高水位、壳层聚合未读摘要、轮询暂停信号与上层导航动作
 * [OUTPUT]: 对外提供 MessageCenter，只轮询当前分区并以服务端排序快照呈现私信和互动、校准通知撤销
 * [POS]: widgets/message-center 的聚合读容器，聊天打开时暂停后台变化请求，不自行复制通知排序或生命周期模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useEffect, useMemo, useState } from 'react';
import { Bell, MessageCircle } from 'lucide-react';
import {
  useConversationChangesQuery,
  useConversationsInfiniteQuery,
} from '@/entities/messaging/api/messaging-queries';
import type { Conversation } from '@/entities/messaging/model/messaging-types';
import {
  useNotificationChangesQuery,
  useNotificationsInfiniteQuery,
} from '@/entities/notifications/api/notification-queries';
import type { ActivityNotification, NotificationType } from '@/entities/notifications/model/notification-types';
import type { SocialUnreadSummary } from '@/entities/social/model/social-summary-types';
import { shouldReconcileNotificationSnapshot } from '@/entities/notifications/model/notification-reconciliation';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
import { SocialPageTitle } from '@/shared/ui/social-page-title';
import { UnreadBadge } from '@/shared/ui/unread-badge';

export type MessageSection = 'conversations' | 'notifications';

interface MessageCenterProps {
  section: MessageSection;
  onSectionChange: (section: MessageSection) => void;
  onOpenConversation: (conversation: Conversation) => void;
  onOpenNotification: (notification: ActivityNotification) => void;
  onOpenProfile: (userId: number) => void;
  unreadSummary: SocialUnreadSummary;
  unreadSummaryReady?: boolean;
  pollingPaused?: boolean;
}

const notificationLabels: Record<NotificationType, string> = {
  discover_like: '赞了你的好饭',
  discover_comment: '评论了你的好饭',
  discover_comment_reply: '回复了你在好饭中的评论',
  treehole_like: '赞了你的树洞',
  treehole_comment: '评论了你的树洞',
  treehole_comment_reply: '回复了你在树洞中的评论',
};

function formatTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function lastMessagePreview(conversation: Conversation) {
  const message = conversation.lastMessage;
  if (!message) return '暂无消息';
  if (message.text) return message.text;
  return message.images.length > 1 ? `${message.images.length} 张图片` : '图片';
}

function mergeConversations(base: Conversation[], changes: ReadonlyMap<number, Conversation>) {
  const merged = new Map(base.map((item) => [item.id, item]));
  changes.forEach((item, id) => {
    const current = merged.get(id);
    const currentMessageId = current?.lastMessage?.id ?? 0;
    const changedMessageId = item.lastMessage?.id ?? 0;
    if (!current || changedMessageId > currentMessageId) merged.set(id, item);
  });
  return [...merged.values()].sort((left, right) => {
    const leftId = left.lastMessage?.id ?? 0;
    const rightId = right.lastMessage?.id ?? 0;
    return rightId - leftId || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-line" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex gap-3 px-4 py-4">
          <div className="size-10 animate-pulse rounded-full bg-shell-strong" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-24 animate-pulse rounded bg-shell-strong" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-shell-strong" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageCenter({ section, onSectionChange, onOpenConversation, onOpenNotification, onOpenProfile, unreadSummary, unreadSummaryReady = false, pollingPaused = false }: MessageCenterProps) {
  const conversationsQuery = useConversationsInfiniteQuery(30, section === 'conversations');
  const notificationsQuery = useNotificationsInfiniteQuery(30, section === 'notifications');
  const baseConversations = useMemo(
    () => conversationsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [conversationsQuery.data]
  );
  const baseNotifications = useMemo(
    () => notificationsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [notificationsQuery.data]
  );
  const [conversationWatermark, setConversationWatermark] = useState<number | null>(null);
  const [notificationWatermark, setNotificationWatermark] = useState<number | null>(null);
  const [conversationChanges, setConversationChanges] = useState<Map<number, Conversation>>(() => new Map());
  const conversationPollingEnabled = section === 'conversations' && !pollingPaused;
  const notificationPollingEnabled = section === 'notifications' && !pollingPaused;
  const conversationChangesQuery = useConversationChangesQuery(
    conversationWatermark,
    conversationPollingEnabled,
  );
  const notificationChangesQuery = useNotificationChangesQuery(
    notificationWatermark,
    notificationPollingEnabled,
  );
  const refetchNotifications = notificationsQuery.refetch;

  useEffect(() => {
    if (!conversationsQuery.isSuccess || conversationWatermark !== null) return;
    setConversationWatermark(Math.max(0, ...baseConversations.map((item) => item.lastMessage?.id ?? 0)));
  }, [baseConversations, conversationWatermark, conversationsQuery.isSuccess]);

  useEffect(() => {
    if (!notificationsQuery.isSuccess || notificationWatermark !== null) return;
    setNotificationWatermark(Math.max(0, ...baseNotifications.map((item) => item.id)));
  }, [baseNotifications, notificationWatermark, notificationsQuery.isSuccess]);

  useEffect(() => {
    if (!conversationPollingEnabled || conversationWatermark === null) return;
    const data = conversationChangesQuery.data;
    if (!data) return;
    if (data.items.length > 0) {
      setConversationChanges((current) => {
        const next = new Map(current);
        data.items.forEach((item) => next.set(item.id, item));
        return next;
      });
    }
    setConversationWatermark((current) => Math.max(current ?? 0, data.afterMessageId));
  }, [conversationChangesQuery.data, conversationPollingEnabled, conversationWatermark]);

  useEffect(() => {
    if (!notificationPollingEnabled || notificationWatermark === null) return;
    const data = notificationChangesQuery.data;
    if (!data) return;
    if (data.items.length > 0) void refetchNotifications();
    setNotificationWatermark((current) => Math.max(current ?? 0, data.afterNotificationId));
  }, [notificationChangesQuery.data, notificationPollingEnabled, notificationWatermark, refetchNotifications]);

  const notificationSnapshotTotal = notificationsQuery.data?.pages[0]?.total ?? null;
  const notificationSummaryTotal = unreadSummaryReady ? unreadSummary.notificationTotal : null;

  useEffect(() => {
    if (!notificationPollingEnabled) return;
    if (!shouldReconcileNotificationSnapshot(notificationSnapshotTotal, notificationSummaryTotal)) return;
    void refetchNotifications();
  }, [notificationPollingEnabled, notificationSnapshotTotal, notificationSummaryTotal, refetchNotifications]);

  const conversations = useMemo(
    () => mergeConversations(baseConversations, conversationChanges),
    [baseConversations, conversationChanges]
  );
  const notifications = baseNotifications;
  const messagingUnread = unreadSummary.messagingUnreadCount;
  const notificationUnread = unreadSummary.notificationUnreadCount;

  return (
    <div className="page-stack-mobile">
      <PageHeader className="py-4" compact title={<SocialPageTitle>消息</SocialPageTitle>} />
      <SegmentedControl
        items={[
          { value: 'notifications', label: <span className="inline-flex items-center gap-2">互动<UnreadBadge count={notificationUnread} /></span> },
          { value: 'conversations', label: <span className="inline-flex items-center gap-2">私信<UnreadBadge count={messagingUnread} /></span> },
        ]}
        value={section}
        onChange={onSectionChange}
      />

      <Card className="overflow-hidden p-0">
        {section === 'conversations' ? (
          conversationsQuery.isLoading ? <ListSkeleton /> : conversationsQuery.isError ? (
            <EmptyState
              action={<Button size="sm" variant="secondary" onClick={() => void conversationsQuery.refetch()}>重试</Button>}
              title="私信加载失败"
            />
          ) : conversations.length === 0 ? (
            <EmptyState description="可以从帖子作者资料发起私信。" title="暂无私信" />
          ) : (
            <div className="divide-y divide-line">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-tint-soft"
                  type="button"
                  onClick={() => onOpenConversation(conversation)}
                >
                  <CommunityAvatar alt={`${conversation.otherUser.displayName}的头像`} className="size-11" src={conversation.otherUser.avatarUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-3">
                      <strong className="min-w-0 flex-1 truncate text-sm font-semibold">{conversation.otherUser.displayName}</strong>
                      {conversation.lastMessage ? <time className="shrink-0 text-xs text-muted">{formatTime(conversation.lastMessage.createdAt)}</time> : null}
                    </span>
                    <span className="mt-1 flex items-center gap-3">
                      <span className="text-clamp-1 min-w-0 flex-1 text-sm text-muted">{lastMessagePreview(conversation)}</span>
                      <UnreadBadge count={conversation.unreadCount} />
                    </span>
                  </span>
                </button>
              ))}
              {conversationsQuery.hasNextPage ? (
                <div className="flex justify-center px-4 py-3">
                  <Button disabled={conversationsQuery.isFetchingNextPage} size="sm" variant="ghost" onClick={() => void conversationsQuery.fetchNextPage()}>
                    {conversationsQuery.isFetchingNextPage ? '加载中…' : '加载更多'}
                  </Button>
                </div>
              ) : null}
            </div>
          )
        ) : notificationsQuery.isLoading ? <ListSkeleton /> : notificationsQuery.isError ? (
          <EmptyState
            action={<Button size="sm" variant="secondary" onClick={() => void notificationsQuery.refetch()}>重试</Button>}
            title="互动通知加载失败"
          />
        ) : notifications.length === 0 ? (
          <EmptyState title="暂无互动通知" />
        ) : (
          <div className="divide-y divide-line">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="flex w-full gap-3 px-4 py-4"
              >
                <button aria-label={`查看${notification.actor.displayName}的资料`} className="h-fit rounded-full hover:opacity-70" type="button" onClick={() => onOpenProfile(notification.actor.id)}>
                  <CommunityAvatar alt={`${notification.actor.displayName}的头像`} className="size-10" src={notification.actor.avatarUrl} />
                </button>
                <button className="flex min-w-0 flex-1 gap-3 text-left hover:opacity-70" type="button" onClick={() => onOpenNotification(notification)}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-6">
                      <strong className="font-semibold">{notification.actor.displayName}</strong>{' '}
                      {notificationLabels[notification.type]}
                    </span>
                    <time className="mt-1 block text-xs text-muted">{formatTime(notification.createdAt)}</time>
                  </span>
                  {!notification.readAt ? <span className="mt-2 size-2 shrink-0 rounded-full bg-ink" aria-label="未读" /> : null}
                </button>
              </div>
            ))}
            {notificationsQuery.hasNextPage ? (
              <div className="flex justify-center px-4 py-3">
                <Button disabled={notificationsQuery.isFetchingNextPage} size="sm" variant="ghost" onClick={() => void notificationsQuery.fetchNextPage()}>
                  {notificationsQuery.isFetchingNextPage ? '加载中…' : '加载更多'}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
