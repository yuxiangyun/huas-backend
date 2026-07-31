/**
 * [INPUT]: 依赖 MessagingOperationsQueryPort 的会话、消息与私有媒体只读能力
 * [OUTPUT]: 对外提供 MessagingAdminApplicationService，作为 Operations 管理入口唯一的私信查询用例
 * [POS]: operations/application 的跨域只读编排器；不接触 Messaging 表、文件路径或任何修改命令
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { MessagingOperationsQueryPort } from '../../messaging/domain/ports';
import type { MessagingListOptions, MessagingMessageListOptions } from '../../messaging/domain/messaging';

export class MessagingAdminApplicationService {
  constructor(private readonly query: MessagingOperationsQueryPort) {}

  listConversations(options?: MessagingListOptions) {
    return this.query.listConversations(options);
  }

  listMessages(conversationId: number, options?: MessagingMessageListOptions) {
    return this.query.listMessages(conversationId, options);
  }

  getMedia(storageKey: string) {
    return this.query.getMedia(storageKey);
  }
}
