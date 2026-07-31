/**
 * [INPUT]: 依赖 Messaging HTTP adapter、查询键与 TanStack Query
 * [OUTPUT]: 对外提供会话分页/增量、目标、消息历史、未读、发送与已读 hooks
 * [POS]: entities/messaging 的缓存编排层，保持人工分页与高水位轮询职责分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getConversationChanges,
  getConversations,
  getConversationTarget,
  getMessages,
  getMessagingUnreadCount,
  markConversationRead,
  sendMessage,
  type SendMessagePayload,
} from '@/entities/messaging/api/messaging-api';
import { messagingQueryKeys } from '@/entities/messaging/model/messaging-query-keys';

export function useConversationsInfiniteQuery(pageSize = 30, enabled = true) {
  return useInfiniteQuery({
    initialPageParam: 1,
    queryKey: messagingQueryKeys.conversationList(pageSize),
    queryFn: ({ pageParam, signal }) => getConversations(pageParam, pageSize, { signal }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled,
  });
}

export function useConversationChangesQuery(afterMessageId: number | null) {
  return useQuery({
    queryKey: messagingQueryKeys.conversationChanges(afterMessageId ?? 0),
    queryFn: ({ signal }) => getConversationChanges(afterMessageId ?? 0, 100, { signal }),
    enabled: afterMessageId !== null,
    refetchInterval: 10_000,
    staleTime: 0,
  });
}

export function useConversationTargetQuery(userId: number | null) {
  return useQuery({
    queryKey: messagingQueryKeys.target(userId ?? 0),
    queryFn: ({ signal }) => getConversationTarget(userId!, { signal }),
    enabled: userId !== null,
  });
}

export function useMessagesInfiniteQuery(conversationId: number | null) {
  return useInfiniteQuery({
    initialPageParam: null as number | null,
    queryKey: messagingQueryKeys.messages(conversationId ?? 0),
    queryFn: ({ pageParam, signal }) => getMessages(
      conversationId!,
      pageParam === null ? { limit: 50 } : { beforeMessageId: pageParam, limit: 50 },
      { signal }
    ),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.beforeMessageId ?? undefined : undefined),
    enabled: conversationId !== null,
  });
}

export function useMessageChangesQuery(conversationId: number | null, afterMessageId: number | null) {
  return useQuery({
    queryKey: messagingQueryKeys.messageChanges(conversationId ?? 0, afterMessageId ?? 0),
    queryFn: ({ signal }) => getMessages(
      conversationId!,
      { afterMessageId: afterMessageId!, limit: 100 },
      { signal }
    ),
    enabled: conversationId !== null && afterMessageId !== null,
    refetchInterval: 5_000,
    staleTime: 0,
  });
}

export function useMessagingUnreadCountQuery() {
  return useQuery({
    queryKey: messagingQueryKeys.unreadCount(),
    queryFn: ({ signal }) => getMessagingUnreadCount({ signal }),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useSendMessageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendMessagePayload) => sendMessage(payload),
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: messagingQueryKeys.messages(message.conversationId) });
      queryClient.invalidateQueries({ queryKey: messagingQueryKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: messagingQueryKeys.unreadCount() });
    },
  });
}

export function useMarkConversationReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, throughMessageId }: { conversationId: number; throughMessageId?: number }) =>
      markConversationRead(conversationId, throughMessageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagingQueryKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: messagingQueryKeys.unreadCount() });
    },
  });
}
