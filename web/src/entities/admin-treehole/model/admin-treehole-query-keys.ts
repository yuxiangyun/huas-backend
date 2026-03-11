export const adminTreeholeQueryKeys = {
  all: () => ['admin', 'treehole'] as const,
  postsAll: () => ['admin', 'treehole', 'posts'] as const,
  posts: (params: { keyword?: string; page?: number; pageSize?: number }) =>
    [...adminTreeholeQueryKeys.postsAll(), params] as const,
  commentsAll: () => ['admin', 'treehole', 'comments'] as const,
  commentsByPost: (postId: number) => [...adminTreeholeQueryKeys.commentsAll(), postId] as const,
  comments: (postId: number, params: { page?: number; pageSize?: number }) =>
    [...adminTreeholeQueryKeys.commentsByPost(postId), params] as const,
  logsAll: () => ['admin', 'treehole', 'logs'] as const,
  logs: (params: { limit?: number; keyword?: string }) =>
    [...adminTreeholeQueryKeys.logsAll(), params] as const,
} as const;
