export const adminQueryKeys = {
  all: () => ['admin'] as const,

  dashboardAll: () => ['admin', 'dashboard'] as const,
  dashboard: (params: { page?: number; search?: string; major?: string; grade?: string }) =>
    [...adminQueryKeys.dashboardAll(), params] as const,

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
