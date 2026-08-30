/**
 * [INPUT]: 依赖 React Router、普通用户认证事实、`/m` 前缀、Social 四路由/预载器、聚合未读与共享徽标
 * [OUTPUT]: 对外提供 MobileTabShell、路径归一化与 SocialShellContext，匿名只承载好饭公开读取，其余 Tab 将意图定向登录
 * [POS]: widgets/mobile-tab-shell 的 Social 应用壳，是公开/认证导航分界、聚合未读唯一轮询与一级导航现场拥有者
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { MessageCircle, Send, UserRound, Utensils } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import { useSocialUnreadSummaryQuery } from '@/entities/social/api/social-summary-query';
import type { SocialUnreadSummary } from '@/entities/social/model/social-summary-types';
import { discoverQueryKeys } from '@/entities/discover/model/discover-query-keys';
import { treeholeQueryKeys } from '@/entities/treehole/model/treehole-query-keys';
import { messagingQueryKeys } from '@/entities/messaging/model/messaging-query-keys';
import { notificationQueryKeys } from '@/entities/notifications/model/notification-query-keys';
import { communityQueryKeys } from '@/entities/community/model/community-query-keys';
import { userQueryKeys } from '@/entities/user/api/user-queries';
import { APP_BASENAME } from '@/shared/config/env';
import { cn } from '@/shared/lib/cn';
import { UnreadBadge } from '@/shared/ui/unread-badge';

const tabs = [
  { to: appRoutes.treehole, label: '树洞', icon: MessageCircle, requiresAuth: true, preload: () => import('@/pages/treehole') },
  { to: appRoutes.discover, label: '好饭', icon: Utensils, requiresAuth: false, preload: () => import('@/pages/discover') },
  { to: appRoutes.messages, label: '消息', icon: Send, requiresAuth: true, preload: () => import('@/pages/messages') },
  { to: appRoutes.me, label: '我的', icon: UserRound, requiresAuth: true, preload: () => import('@/pages/me') },
] as const;

const tabScrollPositions = new Map<string, number>();
const TAB_SCROLL_RESTORE_TIMEOUT_MS = 30_000;

export function clearSocialTabScrollPositions() {
  tabScrollPositions.clear();
}

export function normalizeSocialPathname(pathname: string) {
  if (pathname === APP_BASENAME) return '/';
  if (pathname.startsWith(`${APP_BASENAME}/`)) return pathname.slice(APP_BASENAME.length) || '/';
  return pathname;
}

function tabRootForPath(pathname: string) {
  if (pathname === appRoutes.discover) return appRoutes.discover;
  if (pathname === appRoutes.treehole) return appRoutes.treehole;
  if (pathname === appRoutes.messages) return appRoutes.messages;
  if (pathname === appRoutes.me || pathname.startsWith(`${appRoutes.me}/`)) return appRoutes.me;
  return null;
}

export function MobileTabShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const normalizedPathname = normalizeSocialPathname(location.pathname);
  const activeTabRoot = tabRootForPath(normalizedPathname);
  const activeTabRootRef = useRef(activeTabRoot);
  const summaryQuery = useSocialUnreadSummaryQuery(
    normalizedPathname === appRoutes.messages && !new URLSearchParams(location.search).has('userId')
      ? 15_000
      : 60_000,
    isAuthenticated,
  );
  const unreadSummary = summaryQuery.data ?? {
    messagingUnreadCount: 0,
    notificationUnreadCount: 0,
    notificationTotal: 0,
  };
  const socialUnreadCount = unreadSummary.messagingUnreadCount + unreadSummary.notificationUnreadCount;

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !activeTabRoot) return;
    const previousScrollRestoration = window.history.scrollRestoration;
    let restoreFrame = 0;
    let restoreTimeout = 0;
    let restoreObserver: MutationObserver | null = null;
    let restoreResizeObserver: ResizeObserver | null = null;
    let persistCurrentPosition = false;
    let restorationActive = false;
    let stopRestoring = () => {};
    window.history.scrollRestoration = 'manual';
    if (normalizedPathname === activeTabRoot) {
      const savedPosition = tabScrollPositions.get(activeTabRoot) ?? 0;
      restorationActive = true;
      stopRestoring = () => {
        if (!restorationActive) return;
        restorationActive = false;
        cancelAnimationFrame(restoreFrame);
        window.clearTimeout(restoreTimeout);
        restoreObserver?.disconnect();
        restoreObserver = null;
        restoreResizeObserver?.disconnect();
        restoreResizeObserver = null;
        window.removeEventListener('wheel', stopForUserIntent);
        window.removeEventListener('touchstart', stopForUserIntent);
        window.removeEventListener('pointerdown', stopForUserIntent);
        window.removeEventListener('keydown', stopForUserIntent);
      };
      const stopForUserIntent = () => {
        persistCurrentPosition = true;
        stopRestoring();
      };
      const tryRestore = () => {
        if (!restorationActive) return;
        cancelAnimationFrame(restoreFrame);
        restoreFrame = requestAnimationFrame(() => {
          if (!restorationActive) return;
          window.scrollTo({ top: savedPosition });
          const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          if (savedPosition <= maxScroll + 1 && Math.abs(window.scrollY - savedPosition) <= 1) {
            persistCurrentPosition = true;
            stopRestoring();
          }
        });
      };

      window.addEventListener('wheel', stopForUserIntent, { passive: true });
      window.addEventListener('touchstart', stopForUserIntent, { passive: true });
      window.addEventListener('pointerdown', stopForUserIntent, { passive: true });
      window.addEventListener('keydown', stopForUserIntent);
      restoreObserver = new MutationObserver(tryRestore);
      restoreObserver.observe(document.body, { childList: true, subtree: true });
      if (typeof ResizeObserver !== 'undefined') {
        restoreResizeObserver = new ResizeObserver(tryRestore);
        restoreResizeObserver.observe(document.documentElement);
      }
      restoreTimeout = window.setTimeout(() => {
        persistCurrentPosition = true;
        stopRestoring();
      }, TAB_SCROLL_RESTORE_TIMEOUT_MS);
      tryRestore();
      activeTabRootRef.current = activeTabRoot;
    } else {
      activeTabRootRef.current = null;
    }

    return () => {
      stopRestoring();
      if (activeTabRootRef.current && persistCurrentPosition) {
        tabScrollPositions.set(activeTabRootRef.current, window.scrollY);
      }
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, [activeTabRoot, normalizedPathname]);

  const refreshTab = (path: string) => {
    if (path === appRoutes.treehole) {
      void queryClient.refetchQueries({ queryKey: treeholeQueryKeys.lists(), type: 'active' });
    } else if (path === appRoutes.discover) {
      void queryClient.refetchQueries({ queryKey: discoverQueryKeys.lists(), type: 'active' });
    } else if (path === appRoutes.messages) {
      const queryKey = new URLSearchParams(location.search).get('tab') === 'conversations'
        ? messagingQueryKeys.conversations()
        : notificationQueryKeys.lists();
      void queryClient.refetchQueries({ queryKey, type: 'active' });
    } else if (path === appRoutes.me) {
      void Promise.all([
        queryClient.refetchQueries({ queryKey: communityQueryKeys.profile(), type: 'active' }),
        queryClient.refetchQueries({ queryKey: userQueryKeys.all, type: 'active' }),
      ]);
    }
  };

  const handleTabClick = (event: { preventDefault(): void }, path: string, requiresAuth: boolean) => {
    if (requiresAuth && !isAuthenticated) {
      event.preventDefault();
      navigate(appRoutes.login, { state: { from: path } });
      return;
    }
    if (normalizedPathname !== path) return;
    event.preventDefault();
    tabScrollPositions.set(path, 0);
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    refreshTab(path);
  };

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
                    onFocus={() => {
                      if (isAuthenticated || !tab.requiresAuth) void tab.preload();
                    }}
                    onPointerEnter={() => {
                      if (isAuthenticated || !tab.requiresAuth) void tab.preload();
                    }}
                    onClick={(event) => handleTabClick(event, tab.to, tab.requiresAuth)}
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
            <Outlet context={{ unreadSummary, unreadSummaryReady: summaryQuery.data !== undefined }} />
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
              onFocus={() => {
                if (isAuthenticated || !tab.requiresAuth) void tab.preload();
              }}
              onPointerDown={() => {
                if (isAuthenticated || !tab.requiresAuth) void tab.preload();
              }}
              onClick={(event) => handleTabClick(event, tab.to, tab.requiresAuth)}
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

export interface SocialShellContext {
  unreadSummary: SocialUnreadSummary;
  unreadSummaryReady: boolean;
}

export function useSocialShellContext() {
  return useOutletContext<SocialShellContext>();
}
