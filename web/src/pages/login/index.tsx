/**
 * [INPUT]: 依赖认证状态、站内重定向规则与登录表单，消费当前 React Router location
 * [OUTPUT]: 对外提供 LoginPage，已认证用户按来源跳转，无来源时进入树洞
 * [POS]: pages/login 的路由级认证入口，只编排登录页面与认证后导航
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Navigate, useLocation } from 'react-router-dom';
import { resolveRedirectPath } from '@/app/router/redirect';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import { LoginForm } from '@/features/auth-login/ui/login-form';

export function LoginPage() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const redirectPath = resolveRedirectPath(location);

  if (isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <div className="min-h-dvh bg-shell px-4 py-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem-env(safe-area-inset-top))] max-w-[26rem] items-center justify-center py-8">
        <div className="w-full space-y-5">
          <h1 className="text-center text-2xl font-semibold tracking-[-0.03em]">文理小助手</h1>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
