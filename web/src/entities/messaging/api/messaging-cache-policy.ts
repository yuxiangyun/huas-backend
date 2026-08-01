/**
 * [INPUT]: 依赖 Messaging 消息/历史响应契约与可选现有无限历史快照
 * [OUTPUT]: 对外提供 mergeMessagesIntoHistoryData，原位语义合并最新消息且保留 before 历史页与游标
 * [POS]: entities/messaging/api 的无框架缓存纯策略，确保发送/after 增量跨聊天重开仍存在而不触发最新历史重取
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { Message, MessageListResponse } from '@/entities/messaging/model/messaging-types';

export interface MessageHistoryData {
  pages: MessageListResponse[];
  pageParams: Array<number | null>;
}

export function mergeMessagesIntoHistoryData(
  current: MessageHistoryData | undefined,
  conversationId: number,
  messages: readonly Message[],
  createIfMissing = false,
  hasMoreWhenCreated = false,
): MessageHistoryData | undefined {
  if (messages.length === 0) return current;
  if (!current) {
    if (!createIfMissing) return current;
    const items = [...messages].sort((left, right) => left.id - right.id);
    return {
      pages: [{
        conversationId,
        items,
        beforeMessageId: items[0]?.id ?? null,
        afterMessageId: items.at(-1)?.id ?? null,
        hasMore: hasMoreWhenCreated,
      }],
      pageParams: [null],
    };
  }

  const latestPage = current.pages[0];
  if (!latestPage) return current;
  const merged = new Map(latestPage.items.map((message) => [message.id, message]));
  messages.forEach((message) => merged.set(message.id, message));
  const items = [...merged.values()].sort((left, right) => left.id - right.id);
  return {
    ...current,
    pages: [{
      ...latestPage,
      items,
      beforeMessageId: items[0]?.id ?? latestPage.beforeMessageId,
      afterMessageId: items.at(-1)?.id ?? latestPage.afterMessageId,
    }, ...current.pages.slice(1)],
  };
}
