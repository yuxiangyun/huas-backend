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
    <div className="relative min-h-dvh bg-shell px-[var(--space-shell-x)] py-[var(--space-shell-top)] sm:px-6">
      <div className="mx-auto grid min-h-[calc(100dvh-var(--space-shell-top)-1.5rem)] max-w-[var(--layout-shell-max)] gap-5 py-4 sm:gap-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)] lg:items-center">
        <div className="order-2 space-y-4 lg:order-1 lg:space-y-6 lg:pt-0">
          <span className="inline-flex rounded-pill bg-white/80 px-3.5 py-1.5 text-[0.82rem] font-medium text-muted ring-1 ring-line sm:px-4 sm:py-2 sm:text-sm">
            HUAS Discover
          </span>
          <div className="space-y-3">
            <h1 className="max-w-[11ch] text-[var(--font-title-hero)] font-semibold leading-[0.95] tracking-[-0.05em] text-ink sm:max-w-xl sm:text-5xl">
              拍好饭，从“这顿到底值不值得吃”开始。
            </h1>
            <p className="max-w-[28rem] text-[0.98rem] leading-7 text-muted sm:text-base sm:leading-8">
              登录后可以直接看校园同学的真实推荐，快速知道这顿饭在哪、多少钱、排队久不久、值不值得专门去吃。
            </p>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="glass-panel rounded-[1.25rem] p-3.5 sm:rounded-[1.6rem] sm:p-4">
              <p className="text-sm font-semibold text-ink">更快决策</p>
              <p className="mt-1.5 text-sm leading-6 text-muted">不只看图，还能直接看到档口、价格和推荐理由。</p>
            </div>
            <div className="glass-panel rounded-[1.25rem] p-3.5 sm:rounded-[1.6rem] sm:p-4">
              <p className="text-sm font-semibold text-ink">更顺手发布</p>
              <p className="mt-1.5 text-sm leading-6 text-muted">发帖流程改成完整可滚动弹层，手机上不会再卡住。</p>
            </div>
            <div className="glass-panel rounded-[1.25rem] p-3.5 sm:rounded-[1.6rem] sm:p-4">
              <p className="text-sm font-semibold text-ink">桌面可用</p>
              <p className="mt-1.5 text-sm leading-6 text-muted">桌面不再强行塞进手机宽度，信息密度和阅读节奏都正常。</p>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
