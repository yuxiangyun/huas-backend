/**
 * [INPUT]: 依赖 Community 当前资料与公共用户 ID 读模型
 * [OUTPUT]: 对外提供当前用户和指定公共用户的稳定缓存地址
 * [POS]: entities/community 的缓存命名源，隔离可编辑本人资料与只读公共资料
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const communityQueryKeys = {
  all: ['community'] as const,
  profile: () => [...communityQueryKeys.all, 'profile'] as const,
  users: () => [...communityQueryKeys.all, 'users'] as const,
  user: (userId: number) => [...communityQueryKeys.users(), userId] as const,
};
