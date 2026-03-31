export const discoverQueryKeys = {
  all: ['discover'] as const,
  meta: () => [...discoverQueryKeys.all, 'meta'] as const,
  lists: () => [...discoverQueryKeys.all, 'list'] as const,
  list: (params: unknown) =>
    [...discoverQueryKeys.lists(), params] as const,
  detail: (postId: number) => [...discoverQueryKeys.all, 'detail', postId] as const,
  mines: () => [...discoverQueryKeys.all, 'mine'] as const,
  mine: (params: unknown) =>
    [...discoverQueryKeys.mines(), params] as const,
  comments: (postId: number) => [...discoverQueryKeys.all, 'comments', postId] as const,
  commentList: (postId: number, params: unknown) =>
    [...discoverQueryKeys.comments(postId), params] as const,
};
