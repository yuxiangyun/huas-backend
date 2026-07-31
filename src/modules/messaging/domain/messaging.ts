/**
 * [INPUT]: 依赖 Community 公共资料 DTO 与共享北京时间映射，不依赖 HTTP、SQLite 或文件系统
 * [OUTPUT]: 对外提供 Messaging 策略、事实/响应 DTO 与 UUID、Unicode 文字、图片输入校验纯规则
 * [POS]: modules/messaging/domain 的一对一私信内核，将存储事实收敛为经鉴权的公开读模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingIsoString } from '../../../utils/time';
import type { CommunityProfile } from '../../community/domain/community';

export interface MessagingPolicy {
  maxTextCodePoints: number;
  maxImagesPerMessage: number;
  maxImageBytes: number;
  maxTotalImageBytes: number;
  imageMaxDimension: number;
  imageQuality: number;
  sendLimit: number;
  sendWindowMs: number;
  defaultConversationPageSize: number;
  maxConversationPageSize: number;
  defaultMessagePageSize: number;
  maxMessagePageSize: number;
  orphanMediaGraceMs: number;
}

export const DEFAULT_MESSAGING_POLICY: MessagingPolicy = {
  maxTextCodePoints: 1_000,
  maxImagesPerMessage: 9,
  maxImageBytes: 32 * 1024 * 1024,
  maxTotalImageBytes: 64 * 1024 * 1024,
  imageMaxDimension: 1_280,
  imageQuality: 78,
  sendLimit: 30,
  sendWindowMs: 60_000,
  defaultConversationPageSize: 20,
  maxConversationPageSize: 100,
  defaultMessagePageSize: 50,
  maxMessagePageSize: 100,
  orphanMediaGraceMs: 60 * 60_000,
};

export interface PreparedMessageImage {
  storageKey: string;
  sortOrder: number;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/webp';
}

export interface PreparedMessageMedia {
  batchKey: string;
  images: PreparedMessageImage[];
}

export interface ConversationFact {
  id: number;
  userLowId: number;
  userHighId: number;
  lowLastReadMessageId: number | null;
  highLastReadMessageId: number | null;
  lastMessageId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageImageFact extends PreparedMessageImage {
  id: number;
  messageId: number;
  createdAt: Date;
}

export interface MessageFact {
  id: number;
  conversationId: number;
  senderUserId: number;
  clientMessageId: string;
  text: string | null;
  createdAt: Date;
  images: MessageImageFact[];
}

export interface ConversationListFact {
  conversation: ConversationFact;
  lastMessage: MessageFact | null;
  unreadCount: number;
}

export interface IdempotentMessageFact {
  conversation: ConversationFact;
  message: MessageFact;
}

export interface CommitMessageInput {
  senderUserId: number;
  recipientUserId: number;
  clientMessageId: string;
  text: string | null;
  media: PreparedMessageMedia | null;
  createdAt: Date;
}

export interface CommitMessageResult extends IdempotentMessageFact {
  created: boolean;
}

export interface SendMessageInput {
  senderUserId: number;
  recipientUserId: number;
  clientMessageId: string;
  text?: string | null;
  images?: File[];
}

export interface MessagingListOptions {
  page?: number;
  pageSize?: number;
}

export interface MessagingMessageListOptions {
  afterMessageId?: number;
  limit?: number;
}

export interface MessageImageResponse {
  id: number;
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

export interface MessageResponse {
  id: number;
  conversationId: number;
  sender: CommunityProfile;
  text: string | null;
  images: MessageImageResponse[];
  createdAt: string;
}

export interface ConversationResponse {
  id: number;
  otherUser: CommunityProfile;
  lastMessage: MessageResponse | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListResponse {
  items: ConversationResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface MessageListResponse {
  conversationId: number;
  items: MessageResponse[];
  afterMessageId: number | null;
  hasMore: boolean;
}

export interface MarkConversationReadResponse {
  conversationId: number;
  lastReadMessageId: number | null;
  unreadCount: number;
}

export interface MessagingOperationsConversationResponse {
  id: number;
  participants: [CommunityProfile, CommunityProfile];
  lastMessage: MessageResponse | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingOperationsConversationListResponse {
  items: MessagingOperationsConversationResponse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface MessagingOperationsMessageListResponse {
  conversationId: number;
  items: MessageResponse[];
  afterMessageId: number | null;
  hasMore: boolean;
}

export function normalizeMessageText(value: string | null | undefined, maxCodePoints: number) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new AppError(ErrorCode.PARAM_ERROR, '消息文字必须是字符串');
  }
  const normalized = value?.trim() || '';
  if (Array.from(normalized).length > maxCodePoints) {
    throw new AppError(ErrorCode.PARAM_ERROR, `消息文字不能超过 ${maxCodePoints} 个字符`);
  }
  return normalized || null;
}

export function validateMessageImages(files: readonly File[], policy: MessagingPolicy) {
  if (files.length > policy.maxImagesPerMessage) {
    throw new AppError(
      ErrorCode.PARAM_ERROR,
      `每条消息最多发送 ${policy.maxImagesPerMessage} 张图片`,
    );
  }

  let totalBytes = 0;
  for (const file of files) {
    if (!(file instanceof File) || file.size <= 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '图片文件不合法');
    }
    if (file.size > policy.maxImageBytes) {
      throw new AppError(ErrorCode.PARAM_ERROR, '单张图片原图不能超过 32MB');
    }
    totalBytes += file.size;
  }
  if (totalBytes > policy.maxTotalImageBytes) {
    throw new AppError(ErrorCode.PARAM_ERROR, '每条消息的原图总量不能超过 64MB');
  }
}

export function normalizeClientMessageId(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalized)) {
    throw new AppError(ErrorCode.PARAM_ERROR, 'Idempotency-Key 必须是有效 UUID');
  }
  return normalized;
}

export function validateConversationPair(senderUserId: number, recipientUserId: number) {
  if (!Number.isInteger(senderUserId) || senderUserId <= 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, '发送者 ID 不合法');
  }
  if (!Number.isInteger(recipientUserId) || recipientUserId <= 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, '接收者 ID 不合法');
  }
  if (senderUserId === recipientUserId) {
    throw new AppError(ErrorCode.PARAM_ERROR, '不能给自己发私信');
  }
}

export function clampMessagingPage(value: number | undefined) {
  return !value || !Number.isFinite(value) || value <= 0 ? 1 : Math.floor(value);
}

export function clampMessagingPageSize(value: number | undefined, policy: MessagingPolicy) {
  if (!value || !Number.isFinite(value) || value <= 0) return policy.defaultConversationPageSize;
  return Math.min(Math.floor(value), policy.maxConversationPageSize);
}

export function clampMessageLimit(value: number | undefined, policy: MessagingPolicy) {
  if (!value || !Number.isFinite(value) || value <= 0) return policy.defaultMessagePageSize;
  return Math.min(Math.floor(value), policy.maxMessagePageSize);
}

export function otherParticipantId(conversation: ConversationFact, userId: number) {
  if (conversation.userLowId === userId) return conversation.userHighId;
  if (conversation.userHighId === userId) return conversation.userLowId;
  return null;
}

export function toMessageResponse(
  fact: MessageFact,
  sender: CommunityProfile,
  mediaUrl: (storageKey: string) => string,
): MessageResponse {
  return {
    id: fact.id,
    conversationId: fact.conversationId,
    sender,
    text: fact.text,
    images: fact.images.map((image) => ({
      id: image.id,
      url: mediaUrl(image.storageKey),
      width: image.width,
      height: image.height,
      sizeBytes: image.sizeBytes,
      mimeType: image.mimeType,
    })),
    createdAt: beijingIsoString(fact.createdAt),
  };
}

export function requireProfile(
  profiles: ReadonlyMap<number, CommunityProfile>,
  userId: number,
): CommunityProfile {
  const profile = profiles.get(userId);
  if (!profile) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, `Messaging 公开资料不可用 userId=${userId}`);
  }
  return profile;
}
