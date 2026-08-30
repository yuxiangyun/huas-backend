/**
 * [INPUT]: 依赖 appRoutes、认证事实、普通用户壳/保护边界与路由级动态模块
 * [OUTPUT]: 提供 BrowserRouter，匿名根入口落到好饭只读橱窗，树洞/消息/我的保持登录保护
 * [POS]: app/router 的顶层组装点，以路由子树表达公开内容与身份能力边界并维持 Social/后台分块
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';
import { APP_BASENAME } from '@/shared/config/env';
import { MobileTabShell } from '@/widgets/mobile-tab-shell/mobile-tab-shell';
import { ProtectedRoute } from '@/app/router/guards/protected-route';
import { appRoutes } from '@/app/router/paths';
import { useAuthStore } from '@/entities/auth/model/auth-store';

function SocialIndexRedirect() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return <Navigate to={isAuthenticated ? appRoutes.treehole : appRoutes.discover} replace />;
}

export const router = createBrowserRouter(
  [
    {
      path: appRoutes.login,
      lazy: async () => {
        const module = await import('@/pages/login');
        return { Component: module.LoginPage };
      },
    },
    {
      path: appRoutes.adminRoot,
      lazy: async () => {
        const module = await import('@/pages/admin/layout');
        return { Component: module.AdminLayout };
      },
      children: [
        {
          index: true,
          element: <Navigate to={appRoutes.adminDashboard} replace />,
        },
        {
          path: 'dashboard',
          lazy: async () => {
            const module = await import('@/pages/admin/dashboard');
            return { Component: module.AdminDashboardPage };
          },
        },
        {
          path: 'users',
          lazy: async () => {
            const module = await import('@/pages/admin/users');
            return { Component: module.AdminUsersPage };
          },
        },
        {
          path: 'content',
          lazy: async () => {
            const module = await import('@/pages/admin/content');
            return { Component: module.AdminContentPage };
          },
        },
        {
          path: 'manage/announcements',
          lazy: async () => {
            const module = await import('@/pages/admin/announcements');
            return { Component: module.AdminAnnouncementsPage };
          },
        },
        {
          path: 'manage/discover',
          lazy: async () => {
            const module = await import('@/pages/admin/discover');
            return { Component: module.AdminDiscoverPage };
          },
        },
        {
          path: 'manage/treehole',
          lazy: async () => {
            const module = await import('@/pages/admin/treehole');
            return { Component: module.AdminTreeholeSubPage };
          },
        },
        {
          path: 'manage/messaging',
          lazy: async () => {
            const module = await import('@/pages/admin/messaging');
            return { Component: module.AdminMessagingPage };
          },
        },
        {
          path: 'system/settings',
          lazy: async () => {
            const module = await import('@/pages/admin/settings');
            return { Component: module.AdminSettingsPage };
          },
        },
        {
          path: 'system/logs',
          lazy: async () => {
            const module = await import('@/pages/admin/logs');
            return { Component: module.AdminLogsPage };
          },
        },
      ],
    },
    {
      path: appRoutes.root,
      element: <MobileTabShell />,
      children: [
        {
          index: true,
          element: <SocialIndexRedirect />,
        },
        {
          path: appRoutes.discover.slice(1),
          lazy: async () => {
            const module = await import('@/pages/discover');
            return { Component: module.DiscoverPage };
          },
        },
        {
          element: (
            <ProtectedRoute>
              <Outlet />
            </ProtectedRoute>
          ),
          children: [
            {
              path: appRoutes.treehole.slice(1),
              lazy: async () => {
                const module = await import('@/pages/treehole');
                return { Component: module.TreeholePage };
              },
            },
            {
              path: appRoutes.messages.slice(1),
              lazy: async () => {
                const module = await import('@/pages/messages');
                return { Component: module.MessagesPage };
              },
            },
            {
              path: appRoutes.me.slice(1),
              lazy: async () => {
                const module = await import('@/pages/me');
                return { Component: module.MePage };
              },
            },
            {
              path: appRoutes.meDiscover.slice(1),
              lazy: async () => {
                const module = await import('@/pages/me-discover');
                return { Component: module.MeDiscoverPage };
              },
            },
            {
              path: appRoutes.meTreehole.slice(1),
              lazy: async () => {
                const module = await import('@/pages/me-treehole');
                return { Component: module.MeTreeholePage };
              },
            },
          ],
        },
      ],
    },
  ],
  {
    basename: APP_BASENAME,
  }
);
