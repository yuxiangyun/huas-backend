/**
 * [INPUT]: 依赖 TanStack Query 与统一 ApiError 状态分类
 * [OUTPUT]: 对外提供全局 queryClient 及查询/变更默认重试、90 秒新鲜度与 30 分钟回访保留策略
 * [POS]: app/bootstrap 的服务器状态运行时配置源，为 Feed 提供保守流量基线并允许实体覆盖元数据/实时读模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/http-client';

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
      staleTime: 90_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
