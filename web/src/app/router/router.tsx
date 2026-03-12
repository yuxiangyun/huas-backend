import { Navigate, createBrowserRouter } from 'react-router-dom';
import { APP_BASENAME } from '@/shared/config/env';
import { MobileTabShell } from '@/widgets/mobile-tab-shell/mobile-tab-shell';
import { ProtectedRoute } from '@/app/router/guards/protected-route';
import { appRoutes } from '@/app/router/paths';

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
          path: 'announcements',
          lazy: async () => {
            const module = await import('@/pages/admin/announcements');
            return { Component: module.AdminAnnouncementsPage };
          },
        },
        {
          path: 'discover',
          lazy: async () => {
            const module = await import('@/pages/admin/discover');
            return { Component: module.AdminDiscoverPage };
          },
        },
        {
          path: 'treehole',
          lazy: async () => {
            const module = await import('@/pages/admin/treehole');
            return { Component: module.AdminTreeholeSubPage };
          },
        },
        {
          path: 'logs',
          lazy: async () => {
            const module = await import('@/pages/admin/logs');
            return { Component: module.AdminLogsPage };
          },
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
