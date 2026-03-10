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
