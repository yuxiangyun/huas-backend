/**
 * [INPUT]: 依赖全局 QueryClient、认证 token、私有媒体内存缓存、Toast 视口与 React 子树
 * [OUTPUT]: 对外提供 AppProviders，装配服务器状态上下文、Bearer 媒体缓存生命周期和全局反馈出口
 * [POS]: app/providers 的顶层运行环境边界，在普通用户 token 变化后的子组件请求前清空 Bearer Blob，后台 Cookie 缓存由后台壳管理
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { PropsWithChildren } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/app/bootstrap/query-client';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import { clearPrivateMediaCache } from '@/shared/ui/private-media-image';
import { ToastViewport } from '@/shared/ui/toast-viewport';

export function AppProviders({ children }: PropsWithChildren) {
  const token = useAuthStore((state) => state.token);
  const previousTokenRef = useRef(token);

  useLayoutEffect(() => {
    if (previousTokenRef.current !== token) clearPrivateMediaCache('bearer');
    previousTokenRef.current = token;
  }, [token]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ToastViewport />
    </QueryClientProvider>
  );
}
