/**
 * [INPUT]: 依赖后台 Cookie 会话、React Router Outlet、QueryClient 与全局 Toast
 * [OUTPUT]: 提供 AdminLayout、AdminOutletContextValue 与 useAdminOutletContext
 * [POS]: pages/admin 的独立响应式后台壳，承载登录、分组导航和会话退出
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { type FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import {
  clearAdminSession,
  createAdminSession,
  readAdminSession,
  type AdminSession,
} from '@/features/admin-treehole/model/admin-session';
import { ApiError } from '@/shared/api/http-client';
import { Button } from '@/shared/ui/button';

const fieldClass = 'h-12 w-full rounded-xl border border-black/[0.09] bg-white px-3.5 text-ink outline-none focus:ring-2 focus:ring-[#007aff]/20';

const navGroups = [
  { label: '洞察', items: [
    { to: appRoutes.adminDashboard, label: '总览' },
    { to: appRoutes.adminUsers, label: '用户' },
    { to: appRoutes.adminContent, label: '内容' },
  ] },
  { label: '管理', items: [
    { to: appRoutes.adminAnnouncements, label: '公告' },
    { to: appRoutes.adminDiscover, label: 'Discover' },
    { to: appRoutes.adminTreehole, label: 'Treehole' },
  ] },
  { label: '系统', items: [
    { to: appRoutes.adminCompliance, label: '合规设置' },
    { to: appRoutes.adminLogs, label: '运行日志' },
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
  if (error instanceof ApiError) return error.httpStatus === 401 ? '管理员账号或密码错误' : error.message;
  return error instanceof Error ? error.message : '登录失败';
}

export function AdminLayout() {
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
      setMessage('后台会话已失效，请重新登录');
      pushToast({ title: '后台会话已失效', variant: 'error' });
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
    clearSession(nextMessage ?? '后台会话已失效，请重新登录');
    pushToast({ title: '后台会话已失效', variant: 'error' });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setMessage('请输入管理员账号和密码');
      return;
    }
    login.mutate();
  }

  if (!sessionReady) {
    return <div className="grid min-h-dvh place-items-center bg-[#f5f5f7]"><div className="h-48 w-[min(30rem,calc(100vw-2rem))] animate-pulse rounded-[1.6rem] bg-white" /></div>;
  }

  if (!session) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f5f5f7] px-4 py-10">
        <section className="w-full max-w-[28rem] rounded-[1.7rem] border border-black/[0.06] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-8">
          <p className="text-xs font-medium tracking-[0.08em] text-[#6e6e73]">HUAS ADMIN</p>
          <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.045em]">管理后台</h1>
          <p className="mt-2 text-sm leading-6 text-muted">后台使用独立会话，30 分钟无操作后失效。</p>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="block space-y-2"><span className="text-sm font-medium">管理员账号</span><input autoComplete="username" className={fieldClass} value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label className="block space-y-2"><span className="text-sm font-medium">管理员密码</span><input autoComplete="current-password" className={fieldClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {message ? <p className="rounded-xl bg-[#fff1f0] px-3 py-2.5 text-sm text-[#a12b25]">{message}</p> : null}
            <Button fullWidth size="lg" type="submit" disabled={login.isPending}>{login.isPending ? '登录中…' : '登录'}</Button>
          </form>
          <button className="mt-5 w-full text-center text-sm text-muted" type="button" onClick={() => navigate(appRoutes.me)}>返回应用</button>
        </section>
      </main>
    );
  }

  const outletContext: AdminOutletContextValue = { session, onUnauthorized };

  const navigation = navGroups.map((group) => (
    <section key={group.label} className="space-y-1">
      <p className="px-3 pb-1 pt-3 text-[0.68rem] font-semibold tracking-[0.1em] text-[#8e8e93]">{group.label}</p>
      {group.items.map((item) => (
        <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `block rounded-[0.7rem] px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-black/[0.07] text-black' : 'text-[#59595f] hover:bg-black/[0.035]'}`}>{item.label}</NavLink>
      ))}
    </section>
  ));

  return (
    <div className="min-h-dvh bg-[#f5f5f7] text-ink">
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-[#f5f5f7]/90 backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center justify-between px-4"><button type="button" className="text-sm font-semibold" onClick={() => setMenuOpen((value) => !value)}>管理后台</button><button type="button" className="text-sm text-[#007aff]" onClick={() => clearSession()}>退出</button></div>
        {menuOpen ? <nav className="max-h-[calc(100dvh-3.5rem)] overflow-auto border-t border-black/[0.06] bg-white px-3 pb-4">{navigation}</nav> : null}
      </header>
      <div className="mx-auto grid max-w-[100rem] lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh border-r border-black/[0.06] px-3 py-5 lg:flex lg:flex-col">
          <div className="px-3"><p className="text-xs font-semibold tracking-[0.08em]">HUAS</p><p className="mt-1 text-lg font-semibold tracking-[-0.03em]">管理后台</p></div>
          <nav className="mt-4 flex-1 overflow-auto">{navigation}</nav>
          <div className="space-y-1 border-t border-black/[0.06] pt-3"><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-black/[0.035]" onClick={() => navigate(appRoutes.me)}>返回应用</button><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-black/[0.035]" onClick={() => clearSession()}>退出 · {session.username}</button></div>
        </aside>
        <main className="min-w-0 px-3 py-5 sm:px-5 lg:px-7 lg:py-7 xl:px-10"><Outlet context={outletContext} /></main>
      </div>
    </div>
  );
}
