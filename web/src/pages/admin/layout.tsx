/**
 * [INPUT]: 依赖后台 Cookie 会话、React Router Outlet/位置、应用路径、QueryClient 与全局 Toast
 * [OUTPUT]: 提供 AdminLayout、AdminOutletContextValue 与 useAdminOutletContext，统一后台认证和分组导航
 * [POS]: pages/admin 的桌面优先工作台壳，移动端保留完整导航与退出能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { LogOut, Menu, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import { clearAdminSession, createAdminSession, readAdminSession, type AdminSession } from '@/features/admin-treehole/model/admin-session';
import { ApiError } from '@/shared/api/http-client';
import { buildAppPath } from '@/shared/config/env';
import { Button } from '@/shared/ui/button';
import { IconButton } from '@/shared/ui/icon-button';

const navGroups = [
  { label: '业务', items: [
    { to: appRoutes.adminDashboard, label: '概览' },
    { to: appRoutes.adminUsers, label: '用户' },
  ] },
  { label: '内容', items: [
    { to: appRoutes.adminAnnouncements, label: '公告' },
    { to: appRoutes.adminDiscover, label: '好饭内容' },
    { to: appRoutes.adminTreehole, label: '树洞内容' },
    { to: appRoutes.adminMessaging, label: '私信审计' },
  ] },
  { label: '系统', items: [
    { to: appRoutes.adminSettings, label: '设置' },
    { to: appRoutes.adminLogs, label: '日志' },
  ] },
] as const;

export interface AdminOutletContextValue {
  session: AdminSession;
  onUnauthorized: (message?: string) => void;
}

export function useAdminOutletContext() {
  return useOutletContext<AdminOutletContextValue>();
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.httpStatus === 401) return '账号或密码错误';
  return '登录失败，请重试';
}

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    readAdminSession()
      .then((value) => {
        if (!active) return;
        setSession(value);
        setUsername(value.username);
      })
      .catch(() => undefined)
      .finally(() => active && setSessionReady(true));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      void clearAdminSession().catch(() => undefined);
      queryClient.removeQueries({ queryKey: adminQueryKeys.all() });
      setSession(null);
      setPassword('');
      setMessage('会话已失效，请重新登录');
      pushToast({ title: '会话已失效', variant: 'error' });
    };
    window.addEventListener('huas:admin-session-expired', handleExpired);
    return () => window.removeEventListener('huas:admin-session-expired', handleExpired);
  }, [pushToast, queryClient]);

  const login = useMutation({
    mutationFn: () => createAdminSession(username, password),
    onSuccess: (value) => {
      queryClient.removeQueries({ queryKey: adminQueryKeys.all() });
      setSession(value);
      setPassword('');
      setMessage(null);
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  function clearSession(nextMessage?: string) {
    void clearAdminSession().catch(() => undefined);
    queryClient.removeQueries({ queryKey: adminQueryKeys.all() });
    setSession(null);
    setPassword('');
    setMessage(nextMessage ?? null);
  }

  function onUnauthorized(nextMessage?: string) {
    clearSession(nextMessage ?? '会话已失效，请重新登录');
    pushToast({ title: '会话已失效', variant: 'error' });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setMessage('请输入账号和密码');
      return;
    }
    login.mutate();
  }

  if (!sessionReady) {
    return <div className="grid min-h-dvh place-items-center bg-shell"><div className="h-44 w-[min(26rem,calc(100vw-2rem))] animate-pulse rounded-[0.75rem] bg-white" /></div>;
  }

  if (!session) {
    return (
      <main className="grid min-h-dvh place-items-center bg-shell px-4 py-10">
        <section className="w-full max-w-[26rem] rounded-[0.875rem] border border-line bg-white p-6 shadow-card">
          <h1 className="text-xl font-semibold tracking-[-0.025em]">文理小助手管理后台</h1>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="block space-y-2"><span className="text-sm font-medium">账号</span><input autoComplete="username" className="field-control" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label className="block space-y-2"><span className="text-sm font-medium">密码</span><input autoComplete="current-password" className="field-control" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {message ? <p className="text-sm text-error">{message}</p> : null}
            <Button disabled={login.isPending} fullWidth size="lg" type="submit">{login.isPending ? '登录中…' : '登录'}</Button>
          </form>
          <Button className="mt-3" fullWidth size="sm" type="button" variant="ghost" onClick={() => navigate(appRoutes.me)}>返回应用</Button>
        </section>
      </main>
    );
  }

  const outletContext: AdminOutletContextValue = { session, onUnauthorized };
  const navigation = navGroups.map((group) => (
    <section key={group.label} className="space-y-1">
      <p className="px-3 pb-1 pt-3 text-[0.6875rem] font-medium text-muted">{group.label}</p>
      {group.items.map((item) => {
        const href = buildAppPath(item.to);
        const isActive = location.pathname === item.to || location.pathname === href;
        return <a key={item.to} href={href} className={isActive ? 'block rounded-[0.5rem] bg-tint-soft px-3 py-2 text-sm font-medium text-ink' : 'block rounded-[0.5rem] px-3 py-2 text-sm text-muted hover:bg-tint-soft hover:text-ink'}>{item.label}</a>;
      })}
    </section>
  ));

  return (
    <div className="min-h-dvh bg-shell text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-white lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="text-sm font-semibold">管理后台</span>
          <div className="flex items-center gap-1">
            <IconButton icon={menuOpen ? <X aria-hidden="true" className="size-4" /> : <Menu aria-hidden="true" className="size-4" />} label={menuOpen ? '关闭菜单' : '打开菜单'} onClick={() => setMenuOpen((value) => !value)} />
            <IconButton icon={<LogOut aria-hidden="true" className="size-4" />} label="退出" onClick={() => clearSession()} />
          </div>
        </div>
        {menuOpen ? <nav className="max-h-[calc(100dvh-3.5rem)] overflow-auto border-t border-line bg-white px-3 pb-4">{navigation}</nav> : null}
      </header>

      <div className="mx-auto grid max-w-[100rem] lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh border-r border-line bg-white px-3 py-5 lg:flex lg:flex-col">
          <p className="px-3 text-sm font-semibold">文理小助手</p>
          <nav className="mt-3 flex-1 overflow-auto">{navigation}</nav>
          <div className="space-y-1 border-t border-line pt-3">
            <button className="w-full rounded-[0.5rem] px-3 py-2 text-left text-sm text-muted hover:bg-tint-soft" onClick={() => navigate(appRoutes.me)}>返回应用</button>
            <button className="w-full rounded-[0.5rem] px-3 py-2 text-left text-sm text-muted hover:bg-tint-soft" onClick={() => clearSession()}>退出 · {session.username}</button>
          </div>
        </aside>
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><Outlet context={outletContext} /></main>
      </div>
    </div>
  );
}
