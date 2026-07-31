/**
 * [INPUT]: 依赖 MessagingRepository/MessageMediaStorage 只读能力、CommunityProfileReader 与领域映射规则
 * [OUTPUT]: 对外提供 MessagingOperationsQueryService，实现全会话、历史消息和管理媒体的 MessagingOperationsQueryPort
 * [POS]: modules/messaging/application 的管理只读边界，由 Operations 依赖且不暴露任何写命令
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { beijingIsoString } from '../../../utils/time';
import type { CommunityProfileReader } from '../../community/domain/ports';
import {
  clampMessageLimit,
  clampMessagingPage,
  clampMessagingPageSize,
  requireProfile,
  toMessageResponse,
  type MessageFact,
  type MessagingListOptions,
  type MessagingMessageListOptions,
  type MessagingOperationsConversationListResponse,
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
    const profileIds = facts.items.flatMap((item) => [
      item.conversation.userLowId,
      item.conversation.userHighId,
      item.lastMessage?.senderUserId,
    ]).filter((id): id is number => id !== undefined);
    const profiles = await this.profiles.getMany(profileIds);

    return {
      items: facts.items.map((item) => ({
        id: item.conversation.id,
        participants: [
          requireProfile(profiles, item.conversation.userLowId),
          requireProfile(profiles, item.conversation.userHighId),
        ],
        lastMessage: item.lastMessage
          ? toMessageResponse(
            item.lastMessage,
            requireProfile(profiles, item.lastMessage.senderUserId),
            (key) => this.media.adminUrlFor(key),
          )
          : null,
        createdAt: beijingIsoString(item.conversation.createdAt),
        updatedAt: beijingIsoString(item.conversation.updatedAt),
      })),
      page,
      pageSize,
      total: facts.total,
      hasMore: page * pageSize < facts.total,
    };
  }

  async listMessages(
    conversationId: number,
    options: MessagingMessageListOptions = {},
  ): Promise<MessagingOperationsMessageListResponse | null> {
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, '会话 ID 不合法');
    }
    const afterMessageId = options.afterMessageId === undefined ? 0 : options.afterMessageId;
    if (!Number.isInteger(afterMessageId) || afterMessageId < 0) {
      throw new AppError(ErrorCode.PARAM_ERROR, 'afterMessageId 不合法');
    }
    const limit = clampMessageLimit(options.limit, this.policy);
    const rows = await this.repository.listAllMessages(conversationId, afterMessageId, limit + 1);
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

  getMedia(storageKey: string) {
    return this.media.getForAdmin(storageKey);
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
