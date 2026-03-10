export const discoverQueryKeys = {
  all: ['discover'] as const,
  meta: () => [...discoverQueryKeys.all, 'meta'] as const,
  lists: () => [...discoverQueryKeys.all, 'list'] as const,
  list: (params: unknown) =>
    [...discoverQueryKeys.lists(), params] as const,
  detail: (postId: number) => [...discoverQueryKeys.all, 'detail', postId] as const,
  mine: (params: unknown) =>
    [...discoverQueryKeys.all, 'mine', params] as const,
};
