/**
 * [INPUT]: 依赖 CommunityProfile 公共人物契约并对齐服务端 Messaging DTO
 * [OUTPUT]: 对外提供会话、目标、消息、图片、分页、增量与阅读游标类型
 * [POS]: entities/messaging 的领域契约核心，不包含 React 状态或 HTTP 细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfile } from '@/entities/community/model/community-types';

export interface MessageImage {
  id: number;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

export interface Message {
  id: number;
  conversationId: number;
  clientMessageId: string;
  sender: CommunityProfile;
  text: string | null;
  images: MessageImage[];
  createdAt: string;
}

export interface ConversationTarget {
  profile: CommunityProfile;
  conversationId: number | null;
}

export interface Conversation {
  id: number;
  otherUser: CommunityProfile;
  lastMessage: Message | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListResponse {
  items: Conversation[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface ConversationChangesResponse {
  items: Conversation[];
  afterMessageId: number;
  hasMore: boolean;
}

export interface MessageListResponse {
  conversationId: number;
  items: Message[];
  beforeMessageId: number | null;
  afterMessageId: number | null;
  hasMore: boolean;
}

export interface UnreadCount {
  unreadCount: number;
}

export interface MarkConversationReadResponse {
  conversationId: number;
  lastReadMessageId: number | null;
  unreadCount: number;
}
