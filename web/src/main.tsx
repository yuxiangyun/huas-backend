/**
 * [INPUT]: 依赖 React DOM、应用 Provider、顶层路由、Vite preload 错误事件与全局样式
 * [OUTPUT]: 启动并挂载唯一 Web SPA 根节点，在可记录恢复闸门时对发布版本偏移导致的懒 chunk 失效执行单次刷新
 * [POS]: web/src 的运行入口，只负责装配运行环境与新旧静态版本衔接，不承载业务状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/providers/app-providers';
import { router } from '@/app/router/router';
import '@/app/styles/index.css';

const PRELOAD_RECOVERY_STORAGE_KEY = 'huas-web.preload-recovery-at';
const PRELOAD_RECOVERY_WINDOW_MS = 60_000;

window.addEventListener('vite:preloadError', (event) => {
  let previousRecoveryAt: number;
  try {
    previousRecoveryAt = Number(window.sessionStorage.getItem(PRELOAD_RECOVERY_STORAGE_KEY)) || 0;
  } catch {
    return;
  }
  if (Date.now() - previousRecoveryAt < PRELOAD_RECOVERY_WINDOW_MS) return;

  try {
    window.sessionStorage.setItem(PRELOAD_RECOVERY_STORAGE_KEY, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);
