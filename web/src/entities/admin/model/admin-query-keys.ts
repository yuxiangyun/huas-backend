/**
 * [INPUT]: 依赖后台内容、私信、运行状态的资源边界与筛选/游标参数
 * [OUTPUT]: 提供 dashboard、内容、私信、日志、课表策略、首页弹窗与 Early Rising 展示设置的稳定 TanStack Query key
 * [POS]: entities/admin 的缓存命名边界，让查询、mutation 和会话清理共享同一资源身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const adminQueryKeys = {
  all: () => ['admin'] as const,

  dashboardAll: () => ['admin', 'dashboard'] as const,
  dashboard: (params: { page?: number; search?: string; major?: string; grade?: string }) =>
    [...adminQueryKeys.dashboardAll(), params] as const,
  analytics: (days: 7 | 30 | 90) => ['admin', 'analytics', days] as const,
  scheduleSourcePolicy: () => ['admin', 'academic', 'schedule-source-policy'] as const,
  indexPopupSettings: () => ['admin', 'index-popup'] as const,
  earlyRisingSettings: () => ['admin', 'early-rising', 'settings'] as const,

  announcementsAll: () => ['admin', 'announcements'] as const,

  discoverAll: () => ['admin', 'discover'] as const,
  discover: (params: { page?: number; search?: string; major?: string; grade?: string }) =>
    [...adminQueryKeys.discoverAll(), params] as const,

  treeholeAll: () => ['admin', 'treehole'] as const,
  treeholePostsAll: () => ['admin', 'treehole', 'posts'] as const,
  treeholePosts: (params: { keyword?: string; page?: number; pageSize?: number }) =>
    [...adminQueryKeys.treeholePostsAll(), params] as const,
  treeholeCommentsAll: () => ['admin', 'treehole', 'comments'] as const,
  treeholeCommentsByPost: (postId: number) => [...adminQueryKeys.treeholeCommentsAll(), postId] as const,
  treeholeComments: (postId: number, params: { page?: number; pageSize?: number }) =>
    [...adminQueryKeys.treeholeCommentsByPost(postId), params] as const,

  messagingAll: () => ['admin', 'messaging'] as const,
  messagingConversations: (params: { page?: number; pageSize?: number }) =>
    [...adminQueryKeys.messagingAll(), 'conversations', params] as const,
  messagingConversationChanges: (afterMessageId: number) =>
    [...adminQueryKeys.messagingAll(), 'conversation-changes', afterMessageId] as const,
  messagingMessages: (conversationId: number) =>
    [...adminQueryKeys.messagingAll(), 'messages', conversationId] as const,
  messagingMessageChanges: (conversationId: number, afterMessageId: number) =>
    [...adminQueryKeys.messagingMessages(conversationId), 'changes', afterMessageId] as const,

  logsAll: () => ['admin', 'logs'] as const,
  logs: (params: { limit?: number; keyword?: string }) => [...adminQueryKeys.logsAll(), params] as const,
};
