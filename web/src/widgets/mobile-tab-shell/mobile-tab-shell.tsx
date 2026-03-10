import { NavLink, Outlet } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { cn } from '@/shared/lib/cn';

const tabs = [
  {
    to: appRoutes.discover,
    label: '拍好饭',
    eyebrow: 'Discover',
    description: '看今天吃什么，也把值得推荐的一顿留下来。',
  },
  {
    to: appRoutes.me,
    label: '我的',
    eyebrow: 'Profile',
    description: '管理资料、查看自己的发布和账号状态。',
  },
];

export function MobileTabShell() {
  return (
    <div className="relative min-h-dvh text-ink">
      <div className="shell-backdrop absolute inset-0 -z-10" />

      <div className="mx-auto min-h-dvh max-w-[var(--layout-shell-max)] px-[var(--space-shell-x)] pb-[var(--space-shell-bottom)] pt-[var(--space-shell-top)] sm:px-6 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8 lg:pb-8 lg:pt-6">
        <aside className="hidden lg:flex lg:min-h-[calc(100dvh-3rem)] lg:flex-col lg:justify-between">
          <div className="glass-panel sticky top-6 space-y-6 rounded-[2rem] p-6">
            <div className="space-y-3">
              <span className="inline-flex rounded-pill bg-white/82 px-4 py-2 text-sm font-medium text-muted ring-1 ring-line">
                HUAS Discover
              </span>
              <div className="space-y-2">
                <h1 className="text-[2rem] font-semibold tracking-[-0.05em] text-ink">
                  把校园吃饭这件事，做得更省时间。
                </h1>
                <p className="text-sm leading-7 text-muted">
                  这里不是手机壳投影。桌面端应该能一眼看全信息，移动端也应该能顺手完成发布和查看。
                </p>
              </div>
            </div>

            <nav className="space-y-2">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-[1.6rem] px-4 py-4 transition',
                      isActive
                        ? 'bg-ink text-white shadow-card'
                        : 'bg-white/50 text-ink ring-1 ring-line hover:bg-white/75'
                    )
                  }
                  to={tab.to}
                >
                  {({ isActive }) => (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-semibold">{tab.label}</span>
                        <span className={cn(
                          'rounded-pill px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]',
                          isActive ? 'bg-white/12 text-white/72' : 'bg-white/85 text-muted'
                        )}>
                          {tab.eyebrow}
                        </span>
                      </div>
                      <p className={cn(
                        'text-sm leading-6',
                        isActive ? 'text-white/78' : 'text-muted'
                      )}>
                        {tab.description}
                      </p>
                    </div>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 lg:py-2">
          <div className="mx-auto max-w-[var(--layout-page-max)]">
            <Outlet />
          </div>
        </main>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden">
        <div className="pointer-events-auto mx-auto max-w-[var(--layout-shell-max)] px-[var(--space-shell-x)] pb-[var(--space-tab-bottom)]">
          <nav className="glass-panel grid grid-cols-2 gap-1.5 rounded-[1.5rem] p-1.5">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                className={({ isActive }) =>
                  cn(
                    'flex h-[var(--space-tab-height)] items-center justify-center rounded-[1.2rem] text-[0.95rem] font-medium transition',
                    isActive
                      ? 'bg-ink text-white shadow-card'
                      : 'text-muted hover:bg-white/60 hover:text-ink active:bg-white'
                  )
                }
                to={tab.to}
              >
                <span>{tab.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
