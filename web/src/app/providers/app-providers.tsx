/**
 * [INPUT]: 依赖全局 QueryClient、Toast 视口与 React 子树
 * [OUTPUT]: 对外提供 AppProviders，装配服务器状态上下文和全局反馈出口
 * [POS]: app/providers 的顶层运行环境边界，被 main.tsx 唯一消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/app/bootstrap/query-client';
import { ToastViewport } from '@/shared/ui/toast-viewport';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ToastViewport />
    </QueryClientProvider>
  );
}
