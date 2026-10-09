/**
 * [INPUT]: 依赖 HeroUI、后台 Cookie 会话、React Router、QueryClient 与后台私有媒体缓存
 * [OUTPUT]: 提供 AdminLayout、AdminOutletContextValue 与 useAdminOutletContext，统一认证、会话失效清理与紧凑业务导航
 * [POS]: pages/admin 的响应式工作台壳；后台与用户端共用 HeroUI 令牌，退出完成前禁止新登录以避免 Cookie 请求竞争
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { Link } from '@heroui/react/link';
import { I18nProvider, RouterProvider } from 'react-aria-components';
import { Spinner } from '@heroui/react/spinner';
import { TextField } from '@heroui/react/textfield';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useHref, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import { clearAdminSession, createAdminSession, readAdminSession, type AdminSession } from '@/features/admin-treehole/model/admin-session';
import { ApiError } from '@/shared/api/http-client';
import { cn } from '@/shared/lib/cn';
import { clearPrivateMediaCache } from '@/shared/ui/private-media-image';

const navGroups = [
  [
    { to: appRoutes.adminDashboard, label: '概览' },
    { to: appRoutes.adminUsers, label: '用户' },
  ],
  [
    { to: appRoutes.adminDiscover, label: '好饭' },
    { to: appRoutes.adminTreehole, label: '树洞' },
    { to: appRoutes.adminMessaging, label: '私信' },
    { to: appRoutes.adminAnnouncements, label: '公告' },
    { to: appRoutes.adminIndexPopup, label: '首页弹窗' },
    { to: appRoutes.adminEarlyRising, label: '早起' },
  ],
  [
    { to: appRoutes.adminSchedulePolicy, label: '课表策略' },
    { to: appRoutes.adminRuntime, label: '运行' },
    { to: appRoutes.adminLogs, label: '日志' },
  ],
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
  const navigate = useNavigate();
  return <I18nProvider locale="zh-CN"><RouterProvider navigate={navigate} useHref={useHref}><AdminLayoutContent /></RouterProvider></I18nProvider>;
}

function AdminLayoutContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const [session, setSession] = useState<AdminSession | null>(null);
  const sessionRef = useRef<AdminSession | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const clearLocalSession = useCallback((nextMessage?: string) => {
    sessionRef.current = null;
    clearPrivateMediaCache('admin');
    queryClient.removeQueries({ queryKey: adminQueryKeys.all() });
    setSession(null);
    setPassword('');
    setMenuOpen(false);
    setMessage(nextMessage ?? null);
  }, [queryClient]);

  const onUnauthorized = useCallback((nextMessage?: string) => {
    if (!sessionRef.current) return;
    // A rejected session is already invalid. Sending DELETE here could revoke a newer login.
    clearLocalSession(nextMessage ?? '会话已失效，请重新登录');
    pushToast({ title: '会话已失效', variant: 'error' });
  }, [clearLocalSession, pushToast]);

  useEffect(() => {
    let active = true;
    void readAdminSession()
      .then((value) => {
        if (!active) return;
        sessionRef.current = value;
        setSession(value);
        setUsername(value.username);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setSessionReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleExpired = () => onUnauthorized();
    window.addEventListener('huas:admin-session-expired', handleExpired);
    return () => window.removeEventListener('huas:admin-session-expired', handleExpired);
  }, [onUnauthorized]);

  const login = useMutation({
    mutationFn: () => createAdminSession(username, password),
    onSuccess: (value) => {
      clearPrivateMediaCache('admin');
      queryClient.removeQueries({ queryKey: adminQueryKeys.all() });
      sessionRef.current = value;
      setSession(value);
      setPassword('');
      setMessage(null);
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const logout = useMutation({
    mutationFn: clearAdminSession,
    onSuccess: () => clearLocalSession(),
    onError: (error) => {
      if (error instanceof ApiError && error.httpStatus === 401) onUnauthorized();
      else pushToast({ title: '退出失败，请重试', variant: 'error' });
    },
  });
  const authBusy = login.isPending || logout.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authBusy) return;
    if (!username.trim() || !password) {
      setMessage('请输入账号和密码');
      return;
    }
    login.mutate();
  }

  function signOut() {
    if (!authBusy) logout.mutate();
  }

  if (!sessionReady) {
    return <div className="huas-admin grid min-h-dvh place-items-center" role="status" aria-label="加载中"><Spinner /></div>;
  }

  if (!session) {
    return (
      <main className="huas-admin grid min-h-dvh place-items-center px-4 py-10">
        <div className="w-full max-w-xs space-y-7">
          <h1 className="text-2xl font-semibold tracking-tight">管理后台</h1>
          <Form className="space-y-4" onSubmit={submit}>
            <TextField isRequired isDisabled={authBusy} name="username" value={username} onChange={setUsername}>
              <Label>账号</Label><Input autoComplete="username" />
            </TextField>
            <TextField isRequired isDisabled={authBusy} name="password" type="password" value={password} onChange={setPassword}>
              <Label>密码</Label><Input autoComplete="current-password" />
            </TextField>
            {message ? <p className="text-sm text-danger" role="alert">{message}</p> : null}
            <Button fullWidth isDisabled={authBusy} type="submit">{authBusy ? <Spinner size="sm" color="current" /> : null}登录</Button>
          </Form>
          <Button fullWidth size="sm" variant="ghost" onPress={() => navigate(appRoutes.me)}>返回应用</Button>
        </div>
      </main>
    );
  }

  const navigation = navGroups.map((group, index) => (
    <div key={index} className={cn('space-y-1', index > 0 && 'mt-6')}>
      {group.map((item) => (
        <Link
          key={item.to}
          href={item.to}
          onPress={() => setMenuOpen(false)}
          aria-current={location.pathname === item.to ? 'page' : undefined}
          className={cn(
            'flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-focus',
            location.pathname === item.to ? 'bg-accent-soft font-medium text-accent-soft-foreground' : 'text-muted hover:bg-default hover:text-foreground'
          )}
        >{item.label}</Link>
      ))}
    </div>
  ));

  return (
    <div className="huas-admin min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="text-sm font-semibold">管理后台</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" aria-label={menuOpen ? '关闭菜单' : '打开菜单'} aria-expanded={menuOpen} aria-controls="admin-mobile-nav" onPress={() => setMenuOpen((value) => !value)}>{menuOpen ? '关闭菜单' : '菜单'}</Button>
            <Button isDisabled={authBusy} variant="ghost" aria-label="退出" onPress={signOut}>{logout.isPending ? <Spinner size="sm" /> : null}退出</Button>
          </div>
        </div>
        {menuOpen ? <nav id="admin-mobile-nav" aria-label="后台导航" className="max-h-[calc(100dvh-3.5rem)] overflow-auto border-t border-border px-3 py-4">{navigation}<Button className="mt-4 w-full justify-start" variant="ghost" onPress={() => navigate(appRoutes.me)}>返回应用</Button></nav> : null}
      </header>
      <div className="mx-auto grid max-w-[96rem] lg:grid-cols-[11.5rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col px-3 py-7 lg:flex">
          <p className="shrink-0 px-3 text-lg font-semibold tracking-tight">HUAS<span className="ml-2 text-xs font-normal text-muted">管理</span></p>
          <nav aria-label="后台导航" className="mt-8 min-h-0 flex-1 overflow-auto">{navigation}</nav>
          <div className="mt-6 flex shrink-0 flex-col gap-1">
            <Button className="w-full justify-start" variant="ghost" onPress={() => navigate(appRoutes.me)}>返回应用</Button>
            <Button className="w-full justify-start" isDisabled={authBusy} variant="ghost" onPress={signOut}>{logout.isPending ? <Spinner size="sm" /> : null}退出</Button>
          </div>
        </aside>
        <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-10 lg:py-8 xl:px-12"><Outlet context={{ session, onUnauthorized } satisfies AdminOutletContextValue} /></main>
      </div>
    </div>
  );
}
