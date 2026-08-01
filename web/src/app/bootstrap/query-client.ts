/**
 * [INPUT]: 依赖 TanStack Query、统一 ApiError 状态分类与共享 Query 缓存策略
 * [OUTPUT]: 对外提供全局 queryClient 及查询/变更默认重试、60 秒新鲜度与 15 分钟回访保留策略
 * [POS]: app/bootstrap 的服务器状态运行时配置源，以失焦后按新鲜度重验证为默认并允许实体覆盖引用/后台/轮询策略
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http-client';
import { QUERY_CACHE_POLICY } from '@/shared/api/query-cache-policy';

function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError) {
    if (error.httpStatus >= 400 && error.httpStatus < 500) {
      return false;
    }
  }

  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      ...QUERY_CACHE_POLICY.standard,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});
