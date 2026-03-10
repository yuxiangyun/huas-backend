import { NavLink, Outlet } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { cn } from '@/shared/lib/cn';

const tabs = [
  { to: appRoutes.discover, label: '拍好饭', icon: '◎' },
  { to: appRoutes.me, label: '我的', icon: '◉' },
];

export function MobileTabShell() {
  return (
    <div className="relative min-h-dvh overflow-hidden text-ink">
      <div className="shell-backdrop absolute inset-0 -z-10" />

      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <Outlet />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
        <div className="pointer-events-auto mx-auto max-w-[430px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <nav className="glass-panel grid grid-cols-2 gap-2 rounded-[2rem] p-2">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                className={({ isActive }) =>
                  cn(
                    'flex h-14 items-center justify-center gap-2 rounded-[1.4rem] text-sm font-medium transition',
                    isActive
                      ? 'bg-ink text-white shadow-card'
                      : 'text-muted hover:bg-white/60 hover:text-ink'
                  )
                }
                to={tab.to}
              >
                <span className="text-base leading-none">{tab.icon}</span>
                <span>{tab.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
