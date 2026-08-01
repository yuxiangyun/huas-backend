/**
 * [INPUT]: 不依赖业务实现，仅定义 Social 聚合查询命名空间
 * [OUTPUT]: 对外提供 socialSummaryQueryKeys
 * [POS]: entities/social 的缓存身份源，供壳层查询与两个领域写后失效共享
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const socialSummaryQueryKeys = {
  all: ['social-summary'] as const,
  unread: () => [...socialSummaryQueryKeys.all, 'unread'] as const,
};
