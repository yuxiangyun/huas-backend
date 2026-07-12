/**
 * [INPUT]: 依赖本模块相邻类型、API 与应用基础设施
 * [OUTPUT]: 提供 admin-query-keys.ts 的公开前端契约与运行能力
 * [POS]: web 应用分层中的现有业务边界，被页面或上层模块消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const adminQueryKeys = {
  all: () => ['admin'] as const,

  dashboardAll: () => ['admin', 'dashboard'] as const,
  dashboard: (params: { page?: number; search?: string; major?: string; grade?: string }) =>
    [...adminQueryKeys.dashboardAll(), params] as const,
  analytics: (days: 7 | 30 | 90) => ['admin', 'analytics', days] as const,
  compliance: () => ['admin', 'compliance'] as const,

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

  logsAll: () => ['admin', 'logs'] as const,
  logs: (params: { limit?: number; keyword?: string }) => [...adminQueryKeys.logsAll(), params] as const,
};
