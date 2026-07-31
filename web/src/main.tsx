/**
 * [INPUT]: 依赖 React DOM、应用 Provider、顶层路由与全局样式
 * [OUTPUT]: 启动并挂载唯一 Web SPA 根节点
 * [POS]: web/src 的运行入口，只负责装配运行环境，不承载业务状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/providers/app-providers';
import { router } from '@/app/router/router';
import '@/app/styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);
