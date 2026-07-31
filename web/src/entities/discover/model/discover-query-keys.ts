/**
 * [INPUT]: 依赖 Discover 查询维度、用户与实体 ID
 * [OUTPUT]: 对外提供公开/个人/指定用户帖子、详情与评论的缓存键工厂
 * [POS]: entities/discover 的缓存身份协议，使写入失效范围与后端资源边界保持一致
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

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
  userPostsAll: () => [...discoverQueryKeys.all, 'user-posts'] as const,
  userPostsByUser: (userId: number) => [...discoverQueryKeys.userPostsAll(), userId] as const,
  userPosts: (userId: number, params: unknown) =>
    [...discoverQueryKeys.userPostsByUser(userId), params] as const,
  comments: (postId: number) => [...discoverQueryKeys.all, 'comments', postId] as const,
  commentList: (postId: number, params: unknown) =>
    [...discoverQueryKeys.comments(postId), params] as const,
};
