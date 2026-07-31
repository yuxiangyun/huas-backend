/**
 * [INPUT]: 依赖共享 apiRequest 与 Messaging DTO
 * [OUTPUT]: 对外提供会话分页/增量、目标定位、消息三态读取、幂等图文发送与阅读游标请求
 * [POS]: entities/messaging 的 HTTP adapter，集中维护 `/api/messaging` 协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { apiRequest } from '@/shared/api/http-client';
import type {
  ConversationChangesResponse,
  ConversationListResponse,
  ConversationTarget,
  MarkConversationReadResponse,
  Message,
  MessageListResponse,
  UnreadCount,
} from '@/entities/messaging/model/messaging-types';

interface RequestOptions {
  signal?: AbortSignal;
}

function queryString(params: Record<string, number | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, String(value));
  });
  const value = searchParams.toString();
  return value ? `?${value}` : '';
}

export interface MessageListParams {
  beforeMessageId?: number;
  afterMessageId?: number;
  limit?: number;
}

export interface SendMessagePayload {
  userId: number;
  clientMessageId: string;
  text: string;
  images: File[];
}

export function getConversations(page: number, pageSize: number, options?: RequestOptions) {
  return apiRequest<ConversationListResponse>(
    `/api/messaging/conversations${queryString({ page, pageSize })}`,
    {},
    { signal: options?.signal }
  );
}

export function getConversationChanges(afterMessageId: number, limit: number, options?: RequestOptions) {
  return apiRequest<ConversationChangesResponse>(
    `/api/messaging/conversations/changes${queryString({ afterMessageId, limit })}`,
    {},
    { signal: options?.signal }
  );
}

export function getConversationTarget(userId: number, options?: RequestOptions) {
  return apiRequest<ConversationTarget>(
    `/api/messaging/users/${userId}/conversation`,
    {},
    { signal: options?.signal }
  );
}

export function getMessages(conversationId: number, params: MessageListParams, options?: RequestOptions) {
  return apiRequest<MessageListResponse>(
    `/api/messaging/conversations/${conversationId}/messages${queryString({
      beforeMessageId: params.beforeMessageId,
      afterMessageId: params.afterMessageId,
      limit: params.limit,
    })}`,
    {},
    { signal: options?.signal }
  );
}

export function getMessagingUnreadCount(options?: RequestOptions) {
  return apiRequest<UnreadCount>('/api/messaging/unread-count', {}, { signal: options?.signal });
}

export function sendMessage(payload: SendMessagePayload) {
  const form = new FormData();
  if (payload.text.trim()) form.set('text', payload.text.trim());
  payload.images.forEach((image) => form.append('images', image));

  return apiRequest<Message>(`/api/messaging/users/${payload.userId}/messages`, {
    method: 'POST',
    headers: { 'Idempotency-Key': payload.clientMessageId },
    body: form,
  });
}

export function markConversationRead(conversationId: number, throughMessageId?: number) {
  return apiRequest<MarkConversationReadResponse>(`/api/messaging/conversations/${conversationId}/read`, {
    method: 'PUT',
    body: JSON.stringify(throughMessageId ? { throughMessageId } : {}),
  });
}
