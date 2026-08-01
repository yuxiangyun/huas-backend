/**
 * [INPUT]: 依赖 MessagingRepository/MessageMediaStorage ports、CommunityProfileReader 与领域校验/映射规则
 * [OUTPUT]: 对外提供 MessagingApplicationService，编排会话定位/增量、媒体完成后定时的严格幂等发送、三态历史与未读游标
 * [POS]: modules/messaging/application 的用户用例核心，以 lastMessageId 增量隔离会话轮询与普通 offset 翻页
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingIsoString } from '../../../utils/time';
import type { CommunityProfileReader } from '../../community/domain/ports';
import {
  clampMessagingPage,
  clampMessagingPageSize,
  finalizeMessagePage,
  normalizeClientMessageId,
  normalizeMessagePageQuery,
  normalizeConversationChangesQuery,
  normalizeMessageText,
  otherParticipantId,
  requireProfile,
  toMessageResponse,
  validateConversationPair,
  validateMessageImages,
  type ConversationChangesResponse,
  type ConversationListFact,
  type ConversationListResponse,
  type ConversationTargetResponse,
  type IdempotentMessageFact,
  type MarkConversationReadResponse,
  type MessageFact,
  type MessageListResponse,
  type MessagingConversationChangesOptions,
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
    const text = normalizeMessageText(input.text, this.policy.maxTextCodePoints);
    const images = input.images ?? [];
    validateMessageImages(images, this.policy);
    if (!text && images.length === 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '消息至少需要文字或一张图片');
    }

    const existing = await this.repository.findByClientMessageId(
      input.senderUserId,
      clientMessageId,
    );
    if (existing) {
      return this.requireMatchingIdempotentMessage(
        existing,
        input.recipientUserId,
        text,
        images,
      );
    }

    const recipient = (await this.profiles.getMany([input.recipientUserId])).get(input.recipientUserId);
    if (!recipient) throw new AppError(ErrorCode.PARAM_ERROR, '接收用户不存在');
    await this.repository.assertCanSend(input.senderUserId, clientMessageId, this.now());

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
      try {
        await this.assertMatchingIdempotentPayload(
          committed,
          input.recipientUserId,
          text,
          prepared,
        );
      } finally {
        await this.discardWithoutMasking(prepared);
        prepared = null;
      }
    }
    return this.mapMessage(committed.message);
  }

  async getConversationTarget(
    userId: number,
    targetUserId: number,
  ): Promise<ConversationTargetResponse | null> {
    validateConversationPair(userId, targetUserId);
    const profile = (await this.profiles.getMany([targetUserId])).get(targetUserId);
    if (!profile) return null;
    const conversation = await this.repository.findConversationBetween(userId, targetUserId);
    return { profile, conversationId: conversation?.id ?? null };
  }

  async listConversations(
    userId: number,
    options: MessagingListOptions = {},
  ): Promise<ConversationListResponse> {
    const page = clampMessagingPage(options.page);
    const pageSize = clampMessagingPageSize(options.pageSize, this.policy);
    const facts = await this.repository.listConversations(userId, page, pageSize);
    return {
      items: await this.mapConversationFacts(userId, facts.items),
      page,
      pageSize,
      total: facts.total,
      hasMore: page * pageSize < facts.total,
    };
  }

  async listConversationChanges(
    userId: number,
    options: MessagingConversationChangesOptions = {},
  ): Promise<ConversationChangesResponse> {
    const query = normalizeConversationChangesQuery(options, this.policy);
    const rows = await this.repository.listConversationChanges(
      userId,
      query.afterMessageId,
      query.limit + 1,
    );
    const selected = rows.slice(0, query.limit);
    return {
      items: await this.mapConversationFacts(userId, selected),
      afterMessageId: selected.at(-1)?.conversation.lastMessageId ?? query.afterMessageId,
      hasMore: rows.length > query.limit,
    };
  }

  async listMessages(
    userId: number,
    conversationId: number,
    options: MessagingMessageListOptions = {},
  ): Promise<MessageListResponse | null> {
    const query = normalizeMessagePageQuery(options, this.policy);
    const rows = await this.repository.listMessagesForUser(
      userId,
      conversationId,
      { ...query, limit: query.limit + 1 },
    );
    if (!rows) return null;
    const page = finalizeMessagePage(rows, query);
    return {
      conversationId,
      ...page,
      items: await this.mapMessages(page.items),
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

  private async mapConversationFacts(
    userId: number,
    facts: readonly ConversationListFact[],
  ) {
    const profileIds = facts.flatMap((item) => [
      otherParticipantId(item.conversation, userId),
      item.lastMessage?.senderUserId,
    ]).filter((id): id is number => id !== null && id !== undefined);
    const profiles = await this.profiles.getMany(profileIds);
    return facts.map((item) => {
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
    });
  }

  private async requireMatchingIdempotentMessage(
    existing: IdempotentMessageFact,
    recipientUserId: number,
    text: string | null,
    images: readonly File[],
  ) {
    this.assertMatchingIdempotentEnvelope(existing, recipientUserId, text, images.length);
    let prepared = null;
    try {
      prepared = await this.media.prepare(images);
      if (!await this.media.isEquivalent(prepared, existing.message.images)) {
        throw new AppError(ErrorCode.PARAM_ERROR, 'Idempotency-Key 已用于不同的消息内容');
      }
      return this.mapMessage(existing.message);
    } finally {
      await this.discardWithoutMasking(prepared);
    }
  }

  private async assertMatchingIdempotentPayload(
    existing: IdempotentMessageFact,
    recipientUserId: number,
    text: string | null,
    prepared: Awaited<ReturnType<MessageMediaStorage['prepare']>>,
  ) {
    this.assertMatchingIdempotentEnvelope(
      existing,
      recipientUserId,
      text,
      prepared?.images.length ?? 0,
    );
    if (!await this.media.isEquivalent(prepared, existing.message.images)) {
      throw new AppError(ErrorCode.PARAM_ERROR, 'Idempotency-Key 已用于不同的消息内容');
    }
  }

  private assertMatchingIdempotentEnvelope(
    existing: IdempotentMessageFact,
    recipientUserId: number,
    text: string | null,
    imageCount: number,
  ) {
    if (otherParticipantId(existing.conversation, existing.message.senderUserId) !== recipientUserId) {
      throw new AppError(
        ErrorCode.PARAM_ERROR,
        'Idempotency-Key 已用于另一个私信会话',
      );
    }
    if (existing.message.text !== text || existing.message.images.length !== imageCount) {
      throw new AppError(ErrorCode.PARAM_ERROR, 'Idempotency-Key 已用于不同的消息内容');
    }
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

function normalizePositiveId(value: number, message: string) {
  if (!Number.isInteger(value) || value <= 0) throw new AppError(ErrorCode.PARAM_ERROR, message);
  return value;
}
