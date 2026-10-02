/**
 * [INPUT]: 依赖 Messaging 会话/消息/游标/媒体事实与管理响应 DTO，不依赖 Drizzle、Hono 或具体图片库
 * [OUTPUT]: 对外提供会话/消息仓储、候选媒体发布后同步释放与失败补偿、带审计上下文媒体及 Operations 只读 ports
 * [POS]: modules/messaging/domain 的依赖倒置边界，隔离 SQLite 游标、私有文件，并保证管理面只拿到读取所需稳定键
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type {
  CommitMessageInput,
  CommitMessageResult,
  ConversationFact,
  ConversationListFact,
  IdempotentMessageFact,
  MessageFact,
  MessageImageFact,
  MessagePageQuery,
  MessagingListOptions,
  MessagingConversationChangesOptions,
  MessagingMessageListOptions,
  MessagingOperationsConversationChangesResponse,
  MessagingOperationsConversationListResponse,
  MessagingOperationsMessageListResponse,
  PreparedMessageMedia,
} from './messaging';

export interface MessagingRepository {
  findByClientMessageId(
    senderUserId: number,
    clientMessageId: string,
  ): Promise<IdempotentMessageFact | null>;
  assertCanSend(senderUserId: number, clientMessageId: string, at: Date): Promise<void>;
  commitMessage(input: CommitMessageInput): Promise<CommitMessageResult>;
  findConversationBetween(firstUserId: number, secondUserId: number): Promise<ConversationFact | null>;
  getConversationForUser(userId: number, conversationId: number): Promise<ConversationFact | null>;
  listConversations(
    userId: number,
    page: number,
    pageSize: number,
  ): Promise<{ items: ConversationListFact[]; total: number }>;
  listConversationChanges(
    userId: number,
    afterMessageId: number,
    limit: number,
  ): Promise<ConversationListFact[]>;
  listMessagesForUser(
    userId: number,
    conversationId: number,
    query: MessagePageQuery,
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
  listAllConversationChanges(
    afterMessageId: number,
    limit: number,
  ): Promise<ConversationListFact[]>;
  listAllMessages(
    conversationId: number,
    query: MessagePageQuery,
  ): Promise<MessageFact[] | null>;
}

export interface MessageMediaStorage {
  // 成功 prepare 的候选保护持续到发布后的 release 或 discard 收尾。
  prepare(files: readonly File[]): Promise<PreparedMessageMedia | null>;
  isEquivalent(
    prepared: PreparedMessageMedia | null,
    existing: readonly MessageImageFact[],
  ): Promise<boolean>;
  release(media: PreparedMessageMedia | null): void;
  // 删除失败也释放候选保护，让无主回收兜底；不得用于已提交媒体。
  discard(media: PreparedMessageMedia | null): Promise<void>;
  urlFor(storageKey: string): string;
  adminUrlFor(storageKey: string): string;
  getForParticipant(userId: number, storageKey: string): Promise<Blob | null>;
  getForAdmin(storageKey: string): Promise<AdminMessageMedia | null>;
  cleanupOrphans(before: Date): Promise<number>;
}

export interface MessagingOperationsQueryPort {
  listConversations(
    options?: MessagingListOptions,
  ): Promise<MessagingOperationsConversationListResponse>;
  listConversationChanges(
    options?: MessagingConversationChangesOptions,
  ): Promise<MessagingOperationsConversationChangesResponse>;
  listMessages(
    conversationId: number,
    options?: MessagingMessageListOptions,
  ): Promise<MessagingOperationsMessageListResponse | null>;
  getMedia(storageKey: string): Promise<AdminMessageMedia | null>;
}

export interface AdminMessageMedia {
  data: Blob;
  conversationId: number;
}
