import { type FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DoorArrowRight20Filled } from '@fluentui/react-icons/svg/door-arrow-right';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { getAdminTerminalLogs } from '@/entities/admin/api/admin-api';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import {
  clearAdminBasicSession,
  createAdminBasicSession,
  readAdminBasicSession,
  writeAdminBasicSession,
  type AdminBasicSession,
} from '@/features/admin-treehole/model/admin-session';
import { ApiError } from '@/shared/api/http-client';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/page-header';

const fieldClassName =
  'h-12 w-full rounded-[1.15rem] border border-line bg-white/86 px-3.5 text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-black/10';

const navItems = [
  { to: appRoutes.adminDashboard, label: '总览', description: '系统和用户概览' },
  { to: appRoutes.adminAnnouncements, label: '公告', description: '公告新增与维护' },
  { to: appRoutes.adminDiscover, label: 'Discover', description: '美食帖子管理' },
  { to: appRoutes.adminTreehole, label: 'Treehole', description: '树洞与评论管理' },
  { to: appRoutes.adminLogs, label: '日志', description: '终端日志检索' },
] as const;

export interface AdminOutletContextValue {
  session: AdminBasicSession;
  onUnauthorized: (message?: string) => void;
}

export function useAdminOutletContext() {
  return useOutletContext<AdminOutletContextValue>();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.httpStatus === 401) {
      return '管理员账号或密码错误';
    }
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function AdminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);

  const [adminSession, setAdminSession] = useState<AdminBasicSession | null>(() => readAdminBasicSession());
  const [username, setUsername] = useState(() => readAdminBasicSession()?.username ?? '');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: async (nextSession: AdminBasicSession) =>
      getAdminTerminalLogs(nextSession, { limit: 1 }),
    onSuccess: (_, nextSession) => {
      queryClient.removeQueries({ queryKey: adminQueryKeys.all() });
      writeAdminBasicSession(nextSession);
      setAdminSession(nextSession);
      setAuthMessage(null);
      setPassword('');
      pushToast({
        title: '已连接管理后台',
        variant: 'success',
      });
    },
    onError: (error) => {
      setAuthMessage(getErrorMessage(error, '连接后台失败'));
    },
  });

  function clearSession(message?: string) {
    clearAdminBasicSession();
    queryClient.removeQueries({ queryKey: adminQueryKeys.all() });
    setAdminSession(null);
    setPassword('');
    setAuthMessage(message ?? '管理员会话已失效，请重新登录');
  }

  function onUnauthorized(message?: string) {
    clearSession(message);
    pushToast({
      title: '后台会话已失效',
      message: '请重新输入管理员账号和密码',
      variant: 'error',
    });
  }

  async function handleAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setAuthMessage('请输入管理员账号和密码');
      return;
    }

    setAuthMessage(null);
    await loginMutation.mutateAsync(createAdminBasicSession(username, password));
  }

  const outletContext: AdminOutletContextValue | null = adminSession
    ? { session: adminSession, onUnauthorized }
    : null;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-shell px-[var(--space-shell-x)] py-[var(--space-shell-top)] sm:px-6">
      <div className="shell-backdrop absolute inset-0 -z-10" />

      <div className="mx-auto max-w-[86rem] space-y-4 pb-8 sm:space-y-5">
        <PageHeader
          action={(
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                type="button"
                variant="subtle"
                onClick={() => navigate(appRoutes.me)}
              >
                返回应用
              </Button>
              {adminSession ? (
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    clearSession('已断开后台连接');
                    pushToast({
                      title: '已断开后台',
                      variant: 'info',
                    });
                  }}
                >
                  <DoorArrowRight20Filled aria-hidden="true" className="size-4" />
                  断开
                </Button>
              ) : null}
            </div>
          )}
          compact
          description="集中管理系统状态、公告、Discover、Treehole 与终端日志。"
          eyebrow="Admin"
          title="管理后台"
        />

        {!adminSession ? (
          <div className="mx-auto w-full max-w-[32rem]">
            <Card className="space-y-5 bg-card-strong">
              <div className="space-y-1.5">
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-ink">连接管理员接口</h2>
                <p className="text-sm leading-6 text-muted">
                  管理页面使用后端 `/api/admin/*` 的 Basic Auth，不会复用普通用户登录态。
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleAdminLogin}>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-ink">管理员账号</span>
                  <input
                    autoComplete="username"
                    className={fieldClassName}
                    placeholder="请输入管理员账号"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-ink">管理员密码</span>
                  <input
                    autoComplete="current-password"
                    className={fieldClassName}
                    placeholder="请输入管理员密码"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>

                {authMessage ? (
                  <div className="rounded-[1.1rem] bg-[#fde9e5] px-4 py-3 text-sm leading-6 text-[#8a342c] ring-1 ring-[#efc9c0]">
                    {authMessage}
                  </div>
                ) : null}

                <Button
                  fullWidth
                  size="lg"
                  type="submit"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? '验证中...' : '进入管理后台'}
                </Button>
              </form>
            </Card>
          </div>
        ) : (
          <>
            <Card className="bg-card-strong p-2">
              <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) =>
                      isActive
                        ? 'rounded-[1rem] border border-[#e3c8b8] bg-[linear-gradient(160deg,rgba(255,241,226,0.98),rgba(255,232,211,0.82))] px-3 py-3'
                        : 'rounded-[1rem] border border-line bg-white/70 px-3 py-3 transition hover:bg-white'
                    }
                    to={item.to}
                  >
                    <p className="text-sm font-semibold text-ink">{item.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{item.description}</p>
                  </NavLink>
                ))}
              </nav>
            </Card>

            {outletContext ? <Outlet context={outletContext} /> : null}
          </>
        )}
      </div>
    </div>
  );
}
