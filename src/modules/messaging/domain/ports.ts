/**
 * [INPUT]: 依赖 Messaging 会话、消息、媒体事实与管理响应 DTO，不依赖 Drizzle、Hono 或具体图片库
 * [OUTPUT]: 对外提供 MessagingRepository、MessageMediaStorage 与 MessagingOperationsQueryPort
 * [POS]: modules/messaging/domain 的依赖倒置边界，隔离用例编排、SQLite、私有文件和 Operations 管理入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type {
  CommitMessageInput,
  CommitMessageResult,
  ConversationFact,
  ConversationListFact,
  IdempotentMessageFact,
  MessageFact,
  MessagingListOptions,
  MessagingMessageListOptions,
  MessagingOperationsConversationListResponse,
  MessagingOperationsMessageListResponse,
  PreparedMessageMedia,
} from './messaging';

export interface MessagingRepository {
  findByClientMessageId(
    senderUserId: number,
    clientMessageId: string,
  ): Promise<IdempotentMessageFact | null>;
  commitMessage(input: CommitMessageInput): Promise<CommitMessageResult>;
  getConversationForUser(userId: number, conversationId: number): Promise<ConversationFact | null>;
  listConversations(
    userId: number,
    page: number,
    pageSize: number,
  ): Promise<{ items: ConversationListFact[]; total: number }>;
  listMessagesForUser(
    userId: number,
    conversationId: number,
    afterMessageId: number,
    limit: number,
  ): Promise<MessageFact[] | null>;
  markRead(
    userId: number,
    conversationId: number,
    throughMessageId: number | null,
  ): Promise<{ lastReadMessageId: number | null; unreadCount: number } | null>;
  countUnread(userId: number): Promise<number>;
  listAllConversations(
    page: number,
    pageSize: number,
  ): Promise<{ items: ConversationListFact[]; total: number }>;
  listAllMessages(
    conversationId: number,
    afterMessageId: number,
    limit: number,
  ): Promise<MessageFact[] | null>;
}

export interface MessageMediaStorage {
  prepare(files: readonly File[]): Promise<PreparedMessageMedia | null>;
  discard(media: PreparedMessageMedia | null): Promise<void>;
  urlFor(storageKey: string): string;
  adminUrlFor(storageKey: string): string;
  getForParticipant(userId: number, storageKey: string): Promise<Blob | null>;
  getForAdmin(storageKey: string): Promise<Blob | null>;
  cleanupOrphans(before: Date): Promise<number>;
}

export interface MessagingOperationsQueryPort {
  listConversations(
    options?: MessagingListOptions,
  ): Promise<MessagingOperationsConversationListResponse>;
  listMessages(
    conversationId: number,
    options?: MessagingMessageListOptions,
  ): Promise<MessagingOperationsMessageListResponse | null>;
  getMedia(storageKey: string): Promise<Blob | null>;
}
