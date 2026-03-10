import { BowlChopsticks20Filled } from '@fluentui/react-icons/svg/bowl-chopsticks';
import { Chat20Filled } from '@fluentui/react-icons/svg/chat';
import { Person20Filled } from '@fluentui/react-icons/svg/person';
import { NavLink, Outlet } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { cn } from '@/shared/lib/cn';

const tabs = [
  {
    to: appRoutes.discover,
    label: '拍好饭',
    eyebrow: 'Discover',
    description: '看推荐和发布',
    icon: BowlChopsticks20Filled,
  },
  {
    to: appRoutes.treehole,
    label: '树洞',
    eyebrow: 'Treehole',
    description: '匿名发言',
    icon: Chat20Filled,
  },
  {
    to: appRoutes.me,
    label: '我的',
    eyebrow: 'Profile',
    description: '内容和账号',
    icon: Person20Filled,
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
              <span className="inline-flex rounded-pill bg-white/84 px-4 py-2 text-sm font-medium text-muted ring-1 ring-line">
                HUAS Discover
              </span>
              <div className="space-y-2">
                <h1 className="text-[2rem] font-semibold tracking-[-0.05em] text-ink">
                  校园入口
                </h1>
                <p className="text-sm leading-7 text-muted">
                  拍好饭、树洞、我的
                </p>
              </div>
            </div>

            <nav className="space-y-2">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-[1.6rem] px-4 py-4 transition motion-reduce:transition-none',
                      isActive
                        ? 'bg-ink text-white shadow-card'
                        : 'bg-white/50 text-ink ring-1 ring-line hover:bg-white/75'
                    )
                  }
                  to={tab.to}
                >
                  {({ isActive }) => {
                    const Icon = tab.icon;

                    return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'inline-flex size-9 items-center justify-center rounded-[1rem] ring-1',
                            isActive ? 'bg-white/14 text-white ring-white/14' : 'bg-white/82 text-ink ring-line'
                          )}
                        >
                          <Icon aria-hidden="true" className="size-[1.125rem]" />
                        </span>
                        <span className="text-base font-semibold">{tab.label}</span>
                        <span
                          className={cn(
                            'rounded-pill px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]',
                            isActive ? 'bg-white/12 text-white/72' : 'bg-white/85 text-muted'
                          )}
                        >
                          {tab.eyebrow}
                        </span>
                      </div>
                      <p
                        className={cn(
                          'text-sm leading-6',
                          isActive ? 'text-white/78' : 'text-muted'
                        )}
                      >
                        {tab.description}
                      </p>
                    </div>
                    );
                  }}
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
        <div className="pointer-events-auto mx-auto flex max-w-[var(--layout-shell-max)] justify-center px-[var(--space-shell-x)] pb-[var(--space-tab-bottom)]">
          <nav className="glass-panel mobile-dock-panel grid w-[var(--layout-dock-width)] grid-cols-3 gap-1 rounded-[1.45rem] p-1 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                className={({ isActive }) =>
                  cn(
                    'flex h-[var(--space-tab-height)] items-center justify-center rounded-[1.15rem] px-2.5 text-[0.78rem] font-medium leading-none transition motion-reduce:transition-none',
                    isActive
                      ? 'bg-ink text-white shadow-[0_12px_24px_rgba(0,0,0,0.18)] max-sm:shadow-none'
                      : 'bg-white/38 text-muted sm:hover:bg-white/76 sm:hover:text-ink active:bg-white'
                  )
                }
                to={tab.to}
              >
                {({ isActive }) => {
                  const Icon = tab.icon;

                  return (
                    <span className="flex flex-col items-center justify-center gap-1">
                      <Icon aria-hidden="true" className={cn('size-[1.125rem] shrink-0', isActive ? 'text-white' : 'text-muted')} />
                      <span>{tab.label}</span>
                    </span>
                  );
                }}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
