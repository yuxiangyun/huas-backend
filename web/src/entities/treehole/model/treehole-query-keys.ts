export const treeholeQueryKeys = {
  all: ['treehole'] as const,
  meta: () => [...treeholeQueryKeys.all, 'meta'] as const,
  lists: () => [...treeholeQueryKeys.all, 'list'] as const,
  list: (params: unknown) => [...treeholeQueryKeys.lists(), params] as const,
  mines: () => [...treeholeQueryKeys.all, 'mine'] as const,
  mine: (params: unknown) => [...treeholeQueryKeys.mines(), params] as const,
  detail: (postId: number) => [...treeholeQueryKeys.all, 'detail', postId] as const,
  comments: (postId: number) => [...treeholeQueryKeys.all, 'comments', postId] as const,
  commentList: (postId: number, params: unknown) =>
    [...treeholeQueryKeys.comments(postId), params] as const,
  notifications: () => [...treeholeQueryKeys.all, 'notifications'] as const,
  unreadCount: () => [...treeholeQueryKeys.notifications(), 'unreadCount'] as const,
};
