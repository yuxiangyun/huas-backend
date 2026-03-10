import { Navigate, useLocation } from 'react-router-dom';
import { resolveRedirectPath } from '@/app/router/redirect';
import { appRoutes } from '@/app/router/paths';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import { LoginForm } from '@/features/auth-login/ui/login-form';

export function LoginPage() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const redirectPath = resolveRedirectPath(location, appRoutes.discover);

  if (isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-shell px-4 py-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex min-h-[calc(100dvh-max(2rem,env(safe-area-inset-top)))] max-w-[430px] flex-col justify-between gap-8 py-6">
        <div className="space-y-4 pt-8">
          <span className="inline-flex rounded-pill bg-white/80 px-4 py-2 text-sm font-medium text-muted ring-1 ring-line">
            HUAS Discover
          </span>
          <div className="space-y-3">
            <h1 className="max-w-xs text-4xl font-semibold tracking-[-0.04em] text-ink">
              拍好饭，从今天这顿开始。
            </h1>
            <p className="max-w-sm text-sm leading-7 text-muted">
              使用统一认证登录后，即可浏览最新发现、发布自己的好饭推荐，并在“我的”里查看个人资料和发布记录。
            </p>
          </div>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
