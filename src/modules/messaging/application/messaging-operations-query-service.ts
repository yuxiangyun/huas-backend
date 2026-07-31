/**
 * [INPUT]: 依赖 MessagingRepository/MessageMediaStorage 只读能力、CommunityProfileReader 与领域映射规则
 * [OUTPUT]: 对外提供 MessagingOperationsQueryService，实现全会话/增量、三态历史和可审计管理媒体的只读端口
 * [POS]: modules/messaging/application 的管理只读边界，与用户查询共享会话高水位及消息游标语义且不暴露写命令
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingIsoString } from '../../../utils/time';
import type { CommunityProfile } from '../../community/domain/community';
import type { CommunityProfileReader } from '../../community/domain/ports';
import {
  clampMessagingPage,
  clampMessagingPageSize,
  finalizeMessagePage,
  normalizeConversationChangesQuery,
  normalizeMessagePageQuery,
  requireProfile,
  toMessageResponse,
  type MessageFact,
  type ConversationListFact,
  type MessagingConversationChangesOptions,
  type MessagingListOptions,
  type MessagingMessageListOptions,
  type MessagingOperationsConversationListResponse,
  type MessagingOperationsConversationChangesResponse,
  type MessagingOperationsMessageListResponse,
  type MessagingPolicy,
} from '../domain/messaging';
import type {
  MessageMediaStorage,
  MessagingOperationsQueryPort,
  MessagingRepository,
} from '../domain/ports';

export class MessagingOperationsQueryService implements MessagingOperationsQueryPort {
  constructor(
    private readonly repository: MessagingRepository,
    private readonly media: MessageMediaStorage,
    private readonly profiles: CommunityProfileReader,
    private readonly policy: MessagingPolicy,
  ) {}

  async listConversations(
    options: MessagingListOptions = {},
  ): Promise<MessagingOperationsConversationListResponse> {
    const page = clampMessagingPage(options.page);
    const pageSize = clampMessagingPageSize(options.pageSize, this.policy);
    const facts = await this.repository.listAllConversations(page, pageSize);
    return {
      items: await this.mapConversations(facts.items),
      page,
      pageSize,
      total: facts.total,
      hasMore: page * pageSize < facts.total,
    };
  }

  async listConversationChanges(
    options: MessagingConversationChangesOptions = {},
  ): Promise<MessagingOperationsConversationChangesResponse> {
    const query = normalizeConversationChangesQuery(options, this.policy);
    const rows = await this.repository.listAllConversationChanges(
      query.afterMessageId,
      query.limit + 1,
    );
    const selected = rows.slice(0, query.limit);
    return {
      items: await this.mapConversations(selected),
      afterMessageId: selected.at(-1)?.conversation.lastMessageId ?? query.afterMessageId,
      hasMore: rows.length > query.limit,
    };
  }

  async listMessages(
    conversationId: number,
    options: MessagingMessageListOptions = {},
  ): Promise<MessagingOperationsMessageListResponse | null> {
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '会话 ID 不合法');
    }
    const query = normalizeMessagePageQuery(options, this.policy);
    const rows = await this.repository.listAllMessages(
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

  getMedia(storageKey: string) {
    return this.media.getForAdmin(storageKey);
  }

  private async mapConversations(facts: readonly ConversationListFact[]) {
    const profileIds = facts.flatMap((item) => [
      item.conversation.userLowId,
      item.conversation.userHighId,
      item.lastMessage?.senderUserId,
    ]).filter((id): id is number => id !== undefined);
    const profiles = await this.profiles.getMany(profileIds);
    return facts.map((item) => ({
      id: item.conversation.id,
      participants: [
        requireProfile(profiles, item.conversation.userLowId),
        requireProfile(profiles, item.conversation.userHighId),
      ] as [CommunityProfile, CommunityProfile],
      lastMessage: item.lastMessage
        ? toMessageResponse(
          item.lastMessage,
          requireProfile(profiles, item.lastMessage.senderUserId),
          (key) => this.media.adminUrlFor(key),
        )
        : null,
      createdAt: beijingIsoString(item.conversation.createdAt),
      updatedAt: beijingIsoString(item.conversation.updatedAt),
    }));
  }

  private async mapMessages(facts: readonly MessageFact[]) {
    const profiles = await this.profiles.getMany(facts.map((fact) => fact.senderUserId));
    return facts.map((fact) => toMessageResponse(
      fact,
      requireProfile(profiles, fact.senderUserId),
      (key) => this.media.adminUrlFor(key),
    ));
  }
}
