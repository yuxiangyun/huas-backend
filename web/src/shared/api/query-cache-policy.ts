/**
 * [INPUT]: 依赖 TanStack Query 对 staleTime、gcTime 与 refetchInterval 的时间语义
 * [OUTPUT]: 对外提供标准、静态引用、后台、显式旁路与高水位轮询五类客户端缓存策略
 * [POS]: shared/api 的 Query 缓存事实源，让各业务实体只选择数据类别而不重复发明时间常量
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export const QUERY_CACHE_POLICY = {
  standard: {
    staleTime: MINUTE_MS,
    gcTime: 15 * MINUTE_MS,
  },
  reference: {
    staleTime: 6 * HOUR_MS,
    gcTime: 12 * HOUR_MS,
  },
  admin: {
    staleTime: 15 * SECOND_MS,
    gcTime: 5 * MINUTE_MS,
  },
  bypass: {
    staleTime: 0,
    gcTime: 0,
  },
} as const;

export function liveQueryCachePolicy(refetchInterval: number | false) {
  if (refetchInterval === false) {
    return {
      ...QUERY_CACHE_POLICY.standard,
      refetchInterval: false as const,
      refetchIntervalInBackground: false,
    };
  }

  return {
    refetchInterval,
    staleTime: refetchInterval,
    gcTime: Math.max(30 * SECOND_MS, refetchInterval * 2),
    refetchIntervalInBackground: false,
  };
}
