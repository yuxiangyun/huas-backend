/**
 * [INPUT]: 依赖 appRoutes、用户/后台页面与保护壳，将历史合规路径映射到设置页 canonical
 * [OUTPUT]: 提供 BrowserRouter，包含 `/admin/system/settings` 与旧 `/admin/system/compliance` replace 重定向
 * [POS]: app/router 的顶层组装点，统一 basename、页面边界与路径兼容性
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Navigate, createBrowserRouter } from 'react-router-dom';
import { APP_BASENAME } from '@/shared/config/env';
import { MobileTabShell } from '@/widgets/mobile-tab-shell/mobile-tab-shell';
import { ProtectedRoute } from '@/app/router/guards/protected-route';
import { appRoutes } from '@/app/router/paths';
import { AdminAnnouncementsPage } from '@/pages/admin/announcements';
import { AdminContentPage } from '@/pages/admin/content';
import { AdminDashboardPage } from '@/pages/admin/dashboard';
import { AdminDiscoverPage } from '@/pages/admin/discover';
import { AdminLayout } from '@/pages/admin/layout';
import { AdminLogsPage } from '@/pages/admin/logs';
import { AdminSettingsPage } from '@/pages/admin/settings';
import { AdminTreeholeSubPage } from '@/pages/admin/treehole';
import { AdminUsersPage } from '@/pages/admin/users';

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
      Component: AdminLayout,
      children: [
        {
          index: true,
          element: <Navigate to={appRoutes.adminDashboard} replace />,
        },
        {
          path: 'dashboard',
          Component: AdminDashboardPage,
        },
        {
          path: 'users',
          Component: AdminUsersPage,
        },
        {
          path: 'content',
          Component: AdminContentPage,
        },
        {
          path: 'manage/announcements',
          Component: AdminAnnouncementsPage,
        },
        {
          path: 'manage/discover',
          Component: AdminDiscoverPage,
        },
        {
          path: 'manage/treehole',
          Component: AdminTreeholeSubPage,
        },
        {
          path: 'system/settings',
          Component: AdminSettingsPage,
        },
        {
          path: 'system/compliance',
          element: <Navigate to={appRoutes.adminSettings} replace />,
        },
        {
          path: 'system/logs',
          Component: AdminLogsPage,
        },
      ],
    },
    {
      path: appRoutes.root,
      element: (
        <ProtectedRoute>
          <MobileTabShell />
        </ProtectedRoute>
      ),
      children: [
        {
          index: true,
          element: <Navigate to={appRoutes.discover} replace />,
        },
        {
          path: appRoutes.discover.slice(1),
          lazy: async () => {
            const module = await import('@/pages/discover');
            return { Component: module.DiscoverPage };
          },
        },
        {
          path: appRoutes.treehole.slice(1),
          lazy: async () => {
            const module = await import('@/pages/treehole');
            return { Component: module.TreeholePage };
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
  {
    basename: APP_BASENAME,
  }
);
