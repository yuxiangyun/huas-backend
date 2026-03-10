import { Navigate, useLocation } from 'react-router-dom';
import { resolveRedirectPath } from '@/app/router/redirect';
import { appRoutes } from '@/app/router/paths';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import { LoginForm } from '@/features/auth-login/ui/login-form';
import { PageHero } from '@/shared/ui/page-hero';

export function LoginPage() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const redirectPath = resolveRedirectPath(location, appRoutes.discover);

  if (isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-shell px-[var(--space-shell-x)] py-[var(--space-shell-top)] sm:px-6">
      <div className="shell-backdrop absolute inset-0 -z-10" />
      <div className="mx-auto flex min-h-[calc(100dvh-var(--space-shell-top)-1.5rem)] max-w-[30rem] items-center justify-center py-5 sm:py-8">
        <div className="w-full space-y-4 sm:space-y-5">
          <PageHero
            description="登录后即可使用"
            eyebrow="HUAS Web"
            highlight="文理"
            suffix="小助手"
          />
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
