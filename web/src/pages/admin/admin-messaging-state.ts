import type { AdminMessagingConversation } from '@/entities/admin/model/admin-types';
import type { Message } from '@/entities/messaging/model/messaging-types';

export const CONVERSATION_PAGE_SIZE = 30;

export function messagingPositiveInt(value: string | null, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === null || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}

export function messagingPage(value: string | null) {
  const maximum = Math.floor(Number.MAX_SAFE_INTEGER / CONVERSATION_PAGE_SIZE) + 1;
  return messagingPositiveInt(value, maximum) ?? 1;
}

export function latestConversationMessageId(conversations: readonly AdminMessagingConversation[]) {
  return conversations.reduce((maximum, conversation) => Math.max(maximum, conversation.lastMessage?.id ?? 0), 0);
}

export function mergeAdminConversations(
  base: readonly AdminMessagingConversation[],
  changes: ReadonlyMap<number, AdminMessagingConversation>,
) {
  const merged = new Map(base.map((conversation) => [conversation.id, conversation]));
  changes.forEach((conversation, id) => {
    if ((conversation.lastMessage?.id ?? 0) >= (merged.get(id)?.lastMessage?.id ?? 0)) {
      merged.set(id, conversation);
    }
  });
  return [...merged.values()]
    .sort((left, right) => (right.lastMessage?.id ?? 0) - (left.lastMessage?.id ?? 0) || right.id - left.id)
    .slice(0, CONVERSATION_PAGE_SIZE);
}

export function mergeAdminMessages(base: readonly Message[], changes: ReadonlyMap<number, Message>) {
  const merged = new Map(base.map((message) => [message.id, message]));
  changes.forEach((message, id) => merged.set(id, message));
  return [...merged.values()].sort((left, right) => left.id - right.id);
}

export function messagePreview(message: Message | null) {
  if (!message) return '暂无消息';
  return message.text ?? (message.images.length > 1 ? `${message.images.length} 张图片` : '图片');
}
