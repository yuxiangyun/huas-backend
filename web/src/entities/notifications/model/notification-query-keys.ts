/**
 * [INPUT]: 依赖通知分页与 ID 高水位参数
 * [OUTPUT]: 对外提供 notificationQueryKeys，统一通知列表、增量与未读缓存地址
 * [POS]: entities/notifications 的缓存命名源
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationQueryKeys.all, 'list'] as const,
  list: (pageSize: number) => [...notificationQueryKeys.lists(), pageSize] as const,
  changes: (afterNotificationId: number) => [...notificationQueryKeys.all, 'changes', afterNotificationId] as const,
  unreadCount: () => [...notificationQueryKeys.all, 'unread-count'] as const,
};
