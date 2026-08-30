/**
 * [INPUT]: 依赖 Social 摘要 HTTP adapter、查询键、认证启停事实、共享轮询时间策略与 TanStack Query
 * [OUTPUT]: 对外提供 useSocialUnreadSummaryQuery，由唯一壳层注入启用状态、当前分区轮询和同周期新鲜度
 * [POS]: entities/social 的认证聚合缓存层，匿名壳不发私有请求，登录后按普通 Tab/消息页频率复用短保留结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useQuery } from '@tanstack/react-query';
import { getSocialUnreadSummary } from '@/entities/social/api/social-summary-api';
import { socialSummaryQueryKeys } from '@/entities/social/model/social-summary-query-keys';
import { liveQueryCachePolicy } from '@/shared/api/query-cache-policy';

export function useSocialUnreadSummaryQuery(refetchInterval: number | false, enabled = true) {
  return useQuery({
    queryKey: socialSummaryQueryKeys.unread(),
    queryFn: ({ signal }) => getSocialUnreadSummary({ signal }),
    enabled,
    ...liveQueryCachePolicy(refetchInterval),
  });
}
