/**
 * [INPUT]: 依赖普通用户认证事实、当前位置与登录 canonical 路径
 * [OUTPUT]: 对外提供 ProtectedRoute，放行已认证子树或保留来源重定向登录
 * [POS]: app/router/guards 的普通 Bearer 会话边界，与后台 Cookie 会话完全隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import { appRoutes } from '@/app/router/paths';

export function ProtectedRoute({ children }: PropsWithChildren) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate
        to={appRoutes.login}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return children;
}
