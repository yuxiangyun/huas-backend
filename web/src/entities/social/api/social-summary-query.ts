/**
 * [INPUT]: 依赖 Social 摘要 HTTP adapter、查询键、共享轮询时间策略与 TanStack Query
 * [OUTPUT]: 对外提供 useSocialUnreadSummaryQuery，由唯一壳层注入当前分区轮询和同周期新鲜度
 * [POS]: entities/social 的聚合缓存层，普通 Tab 低频、消息页中频且复用同一短保留请求结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useQuery } from '@tanstack/react-query';
import { getSocialUnreadSummary } from '@/entities/social/api/social-summary-api';
import { socialSummaryQueryKeys } from '@/entities/social/model/social-summary-query-keys';
import { liveQueryCachePolicy } from '@/shared/api/query-cache-policy';

export function useSocialUnreadSummaryQuery(refetchInterval: number | false) {
  return useQuery({
    queryKey: socialSummaryQueryKeys.unread(),
    queryFn: ({ signal }) => getSocialUnreadSummary({ signal }),
    ...liveQueryCachePolicy(refetchInterval),
  });
}
