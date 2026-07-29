/**
 * [INPUT]: 依赖 React Router Outlet/NavLink、Lucide 图标与三个普通用户主路由
 * [OUTPUT]: 对外提供 MobileTabShell，移动端呈现标准底部 Tab，桌面端呈现简洁侧栏
 * [POS]: widgets/mobile-tab-shell 的普通用户应用壳，只承载品牌与一级导航，不重复页面说明
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { MessageCircle, UserRound, Utensils } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { cn } from '@/shared/lib/cn';

const tabs = [
  { to: appRoutes.treehole, label: '树洞', icon: MessageCircle },
  { to: appRoutes.discover, label: '好饭', icon: Utensils },
  { to: appRoutes.me, label: '我的', icon: UserRound },
] as const;

export function MobileTabShell() {
  return (
    <div className="min-h-dvh bg-shell text-ink">
      <div className="mx-auto min-h-dvh max-w-[var(--layout-shell-max)] px-[var(--space-shell-x)] pb-[var(--space-shell-bottom)] pt-[var(--space-shell-top)] sm:px-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:pb-10 lg:pt-8">
        <aside className="hidden lg:block">
          <div className="sticky top-8">
            <p className="px-3 text-base font-semibold tracking-[-0.02em]">文理小助手</p>
            <nav className="mt-5 space-y-1" aria-label="主导航">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <NavLink
                    key={tab.to}
                    className={({ isActive }) => cn(
                      'flex h-10 items-center gap-3 rounded-[0.625rem] px-3 text-sm font-medium transition-colors',
                      isActive ? 'bg-tint-soft text-ink' : 'text-muted hover:bg-tint-soft hover:text-ink'
                    )}
                    to={tab.to}
                  >
                    <Icon aria-hidden="true" className="size-[1.125rem]" strokeWidth={1.9} />
                    {tab.label}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mx-auto max-w-[var(--layout-page-max)]">
            <Outlet />
          </div>
        </main>
      </div>

      <nav
        aria-label="主导航"
        className="fixed bottom-[calc(0.625rem+env(safe-area-inset-bottom))] left-3 right-3 z-30 mx-auto grid max-w-[28rem] grid-cols-3 rounded-[1rem] border border-line bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)] lg:hidden"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              className={({ isActive }) => cn(
                'flex h-[var(--space-tab-height)] min-w-0 flex-col items-center justify-center gap-1 rounded-[0.75rem] text-[0.6875rem] font-medium transition-colors',
                isActive ? 'bg-tint-soft text-ink' : 'text-muted active:bg-tint-soft'
              )}
              to={tab.to}
            >
              {({ isActive }) => (
                <>
                  <Icon aria-hidden="true" className="size-5" fill={isActive ? 'currentColor' : 'none'} strokeWidth={isActive ? 2.1 : 1.8} />
                  <span>{tab.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
