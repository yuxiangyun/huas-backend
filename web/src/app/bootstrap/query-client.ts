/**
 * [INPUT]: 依赖 TanStack Query 与统一 ApiError 状态分类
 * [OUTPUT]: 对外提供全局 queryClient 及查询/变更默认重试策略
 * [POS]: app/bootstrap 的服务器状态运行时配置源，拒绝自动重试确定性 4xx
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
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
