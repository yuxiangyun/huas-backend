/**
 * [INPUT]: 依赖 Treehole 查询维度与实体 ID
 * [OUTPUT]: 对外提供 Treehole 资料、列表、详情与评论缓存键工厂
 * [POS]: entities/treehole 的缓存身份协议，保证跨 mutation 精准刷新社区内容
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const treeholeQueryKeys = {
  all: ['treehole'] as const,
  meta: () => [...treeholeQueryKeys.all, 'meta'] as const,
  lists: () => [...treeholeQueryKeys.all, 'list'] as const,
  list: (params: unknown) => [...treeholeQueryKeys.lists(), params] as const,
  mines: () => [...treeholeQueryKeys.all, 'mine'] as const,
  mine: (params: unknown) => [...treeholeQueryKeys.mines(), params] as const,
  userPostsAll: () => [...treeholeQueryKeys.all, 'user-posts'] as const,
  userPostsByUser: (userId: number) => [...treeholeQueryKeys.userPostsAll(), userId] as const,
  userPosts: (userId: number, params: unknown) =>
    [...treeholeQueryKeys.userPostsByUser(userId), params] as const,
  detail: (postId: number) => [...treeholeQueryKeys.all, 'detail', postId] as const,
  comments: (postId: number) => [...treeholeQueryKeys.all, 'comments', postId] as const,
  commentList: (postId: number, params: unknown) =>
    [...treeholeQueryKeys.comments(postId), params] as const,
};
