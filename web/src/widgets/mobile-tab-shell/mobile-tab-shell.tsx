/**
 * [INPUT]: 依赖 React Router、Social 四个主路由、消息/通知未读读模型与共享徽标
 * [OUTPUT]: 对外提供 MobileTabShell，以连续白色页面基底在移动端呈现四项底部 Tab、桌面端呈现固定社交侧栏
 * [POS]: widgets/mobile-tab-shell 的普通用户应用壳，只承载品牌、一级导航和聚合未读
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { MessageCircle, Send, UserRound, Utensils } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { useMessagingUnreadCountQuery } from '@/entities/messaging/api/messaging-queries';
import { useNotificationUnreadCountQuery } from '@/entities/notifications/api/notification-queries';
import { cn } from '@/shared/lib/cn';
import { UnreadBadge } from '@/shared/ui/unread-badge';

const tabs = [
  { to: appRoutes.treehole, label: '树洞', icon: MessageCircle },
  { to: appRoutes.discover, label: '好饭', icon: Utensils },
  { to: appRoutes.messages, label: '消息', icon: Send },
  { to: appRoutes.me, label: '我的', icon: UserRound },
] as const;

export function MobileTabShell() {
  const messagingUnreadQuery = useMessagingUnreadCountQuery();
  const notificationUnreadQuery = useNotificationUnreadCountQuery();
  const socialUnreadCount = (messagingUnreadQuery.data?.unreadCount ?? 0) + (notificationUnreadQuery.data?.unreadCount ?? 0);

  return (
    <div className="min-h-dvh bg-white text-ink">
      <div className="mx-auto min-h-dvh max-w-[var(--layout-shell-max)] px-[var(--space-shell-x)] pb-[var(--space-shell-bottom)] pt-[var(--space-shell-top)] sm:px-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:pb-10 lg:pt-8">
        <aside className="hidden lg:block">
          <div className="sticky top-8">
            <p className="px-3 text-base font-semibold tracking-[-0.02em]">文理社区</p>
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
                    <span className="flex-1">{tab.label}</span>
                    {tab.to === appRoutes.messages ? <UnreadBadge count={socialUnreadCount} /> : null}
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
        className="fixed bottom-0 left-0 right-0 z-30 mx-auto grid grid-cols-4 border-t border-line bg-white px-1 pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              className={({ isActive }) => cn(
                'relative flex h-[var(--space-tab-height)] min-w-0 flex-col items-center justify-center gap-1 rounded-[0.625rem] text-[0.6875rem] font-medium transition-colors',
                isActive ? 'text-ink' : 'text-ink active:bg-tint-soft'
              )}
              to={tab.to}
            >
              {({ isActive }) => (
                <>
                  <Icon aria-hidden="true" className="size-5" fill={isActive ? 'currentColor' : 'none'} strokeWidth={isActive ? 2.1 : 1.8} />
                  <span>{tab.label}</span>
                  {tab.to === appRoutes.messages && socialUnreadCount > 0 ? (
                    <UnreadBadge className="absolute left-1/2 top-0.5 ml-2.5" count={socialUnreadCount} />
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
