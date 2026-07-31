/**
 * [INPUT]: 依赖 MessagingRepository/MessageMediaStorage ports、CommunityProfileReader 与领域校验/映射规则
 * [OUTPUT]: 对外提供 MessagingApplicationService，编排幂等发送、会话/增量消息、未读、阅读游标和参与者媒体
 * [POS]: modules/messaging/application 的用户用例核心，保证转码在事务外、提交前失败/并发幂等补偿候选媒体，提交后不破坏已引用文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingIsoString } from '../../../utils/time';
import type { CommunityProfileReader } from '../../community/domain/ports';
import {
  clampMessageLimit,
  clampMessagingPage,
  clampMessagingPageSize,
  normalizeClientMessageId,
  normalizeMessageText,
  otherParticipantId,
  requireProfile,
  toMessageResponse,
  validateConversationPair,
  validateMessageImages,
  type ConversationFact,
  type ConversationListResponse,
  type IdempotentMessageFact,
  type MarkConversationReadResponse,
  type MessageFact,
  type MessageListResponse,
  type MessagingListOptions,
  type MessagingMessageListOptions,
  type MessagingPolicy,
  type SendMessageInput,
} from '../domain/messaging';
import type {
  MessageMediaStorage,
  MessagingRepository,
} from '../domain/ports';

export class MessagingApplicationService {
  constructor(
    private readonly repository: MessagingRepository,
    private readonly media: MessageMediaStorage,
    private readonly profiles: CommunityProfileReader,
    private readonly policy: MessagingPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async send(input: SendMessageInput) {
    validateConversationPair(input.senderUserId, input.recipientUserId);
    const clientMessageId = normalizeClientMessageId(input.clientMessageId);

    const existing = await this.repository.findByClientMessageId(
      input.senderUserId,
      clientMessageId,
    );
    if (existing) return this.requireMatchingIdempotentRecipient(existing, input.recipientUserId);

    const text = normalizeMessageText(input.text, this.policy.maxTextCodePoints);
    const images = input.images ?? [];
    validateMessageImages(images, this.policy);
    if (!text && images.length === 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '消息至少需要文字或一张图片');
    }

    const recipient = (await this.profiles.getMany([input.recipientUserId])).get(input.recipientUserId);
    if (!recipient) throw new AppError(ErrorCode.PARAM_ERROR, '接收用户不存在');

    let prepared = null;
    let committed;
    try {
      prepared = await this.media.prepare(images);
      committed = await this.repository.commitMessage({
        senderUserId: input.senderUserId,
        recipientUserId: input.recipientUserId,
        clientMessageId,
        text,
        media: prepared,
        createdAt: this.now(),
      });

    } catch (error) {
      await this.discardWithoutMasking(prepared);
      throw error;
    }

    if (committed.created) {
      // 事务已将文件引用变为持久事实，后续投影/响应失败不得再补偿删除。
      prepared = null;
    } else {
      await this.discardWithoutMasking(prepared);
      prepared = null;
    }
    return this.requireMatchingIdempotentRecipient(committed, input.recipientUserId);
  }

  async listConversations(
    userId: number,
    options: MessagingListOptions = {},
  ): Promise<ConversationListResponse> {
    const page = clampMessagingPage(options.page);
    const pageSize = clampMessagingPageSize(options.pageSize, this.policy);
    const facts = await this.repository.listConversations(userId, page, pageSize);
    const profileIds = facts.items.flatMap((item) => [
      otherParticipantId(item.conversation, userId),
      item.lastMessage?.senderUserId,
    ]).filter((id): id is number => id !== null && id !== undefined);
    const profiles = await this.profiles.getMany(profileIds);

    return {
      items: facts.items.map((item) => {
        const otherUserId = otherParticipantId(item.conversation, userId);
        if (!otherUserId) throw new AppError(ErrorCode.INTERNAL_ERROR, '会话参与者事实不一致');
        return {
          id: item.conversation.id,
          otherUser: requireProfile(profiles, otherUserId),
          lastMessage: item.lastMessage
            ? toMessageResponse(
              item.lastMessage,
              requireProfile(profiles, item.lastMessage.senderUserId),
              (key) => this.media.urlFor(key),
            )
            : null,
          unreadCount: item.unreadCount,
          createdAt: beijingIsoString(item.conversation.createdAt),
          updatedAt: beijingIsoString(item.conversation.updatedAt),
        };
      }),
      page,
      pageSize,
      total: facts.total,
      hasMore: page * pageSize < facts.total,
    };
  }

  async listMessages(
    userId: number,
    conversationId: number,
    options: MessagingMessageListOptions = {},
  ): Promise<MessageListResponse | null> {
    const afterMessageId = normalizeAfterMessageId(options.afterMessageId);
    const limit = clampMessageLimit(options.limit, this.policy);
    const rows = await this.repository.listMessagesForUser(
      userId,
      conversationId,
      afterMessageId,
      limit + 1,
    );
    if (!rows) return null;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return {
      conversationId,
      items: await this.mapMessages(items),
      afterMessageId: items.at(-1)?.id ?? (afterMessageId || null),
      hasMore,
    };
  }

  countUnread(userId: number) {
    return this.repository.countUnread(userId);
  }

  async markRead(
    userId: number,
    conversationId: number,
    throughMessageId?: number,
  ): Promise<MarkConversationReadResponse | null> {
    const normalizedMessageId = throughMessageId === undefined
      ? null
      : normalizePositiveId(throughMessageId, '消息 ID 不合法');
    const result = await this.repository.markRead(userId, conversationId, normalizedMessageId);
    return result ? { conversationId, ...result } : null;
  }

  getMedia(userId: number, storageKey: string) {
    return this.media.getForParticipant(userId, storageKey);
  }

  private async requireMatchingIdempotentRecipient(
    existing: IdempotentMessageFact,
    recipientUserId: number,
  ) {
    if (otherParticipantId(existing.conversation, existing.message.senderUserId) !== recipientUserId) {
      throw new AppError(
        ErrorCode.PARAM_ERROR,
        'Idempotency-Key 已用于另一个私信会话',
      );
    }
    return this.mapMessage(existing.message);
  }

  private async mapMessage(fact: MessageFact) {
    const profiles = await this.profiles.getMany([fact.senderUserId]);
    return toMessageResponse(
      fact,
      requireProfile(profiles, fact.senderUserId),
      (key) => this.media.urlFor(key),
    );
  }

  private async mapMessages(facts: readonly MessageFact[]) {
    const profiles = await this.profiles.getMany(facts.map((fact) => fact.senderUserId));
    return facts.map((fact) => toMessageResponse(
      fact,
      requireProfile(profiles, fact.senderUserId),
      (key) => this.media.urlFor(key),
    ));
  }

  private async discardWithoutMasking(prepared: Awaited<ReturnType<MessageMediaStorage['prepare']>>) {
    try {
      await this.media.discard(prepared);
    } catch {
      // 主失败必须保留；周期无主清理会回收补偿失败的候选目录。
    }
  }
}

function normalizeAfterMessageId(value: number | undefined) {
  if (value === undefined) return 0;
  return normalizePositiveId(value, 'afterMessageId 不合法');
}

function normalizePositiveId(value: number, message: string) {
  if (!Number.isInteger(value) || value <= 0) throw new AppError(ErrorCode.PARAM_ERROR, message);
  return value;
}
