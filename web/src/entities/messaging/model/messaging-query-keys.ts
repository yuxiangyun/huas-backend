/**
 * [INPUT]: 依赖 Messaging 查询参数的稳定序列化需求
 * [OUTPUT]: 对外提供 messagingQueryKeys，统一会话、增量、目标、历史与未读缓存地址
 * [POS]: entities/messaging 的缓存命名源，避免页面硬编码查询键
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const messagingQueryKeys = {
  all: ['messaging'] as const,
  conversations: () => [...messagingQueryKeys.all, 'conversations'] as const,
  conversationList: (pageSize: number) => [...messagingQueryKeys.conversations(), 'list', pageSize] as const,
  conversationChanges: (afterMessageId: number) => [...messagingQueryKeys.conversations(), 'changes', afterMessageId] as const,
  target: (userId: number) => [...messagingQueryKeys.all, 'target', userId] as const,
  messages: (conversationId: number) => [...messagingQueryKeys.all, 'messages', conversationId] as const,
  messageChanges: (conversationId: number, afterMessageId: number) =>
    [...messagingQueryKeys.messages(conversationId), 'changes', afterMessageId] as const,
  unreadCount: () => [...messagingQueryKeys.all, 'unread-count'] as const,
};
