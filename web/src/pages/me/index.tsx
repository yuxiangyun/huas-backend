/**
 * [INPUT]: 依赖校园用户资料、社区资料弹层、个人内容路由、日历订阅与认证状态
 * [OUTPUT]: 对外提供 MePage，以统一资料入口、个人内容列表和独立退出行组成账户页
 * [POS]: pages/me 的页面编排器，不使用宣传卡片，不持有底层 HTTP 协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { CalendarDays, ChevronRight, LogOut, MessageCircle, Pencil, Utensils } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import { useTreeholeUnreadNotificationCountQuery } from '@/entities/treehole/api/treehole-queries';
import { useCalendarSubscriptionLinkMutation, useUserInfoQuery } from '@/entities/user/api/user-queries';
import { Card } from '@/shared/ui/card';

const loadProfileSheet = () => import('@/widgets/treehole-avatar-sheet/treehole-avatar-sheet');
const LazyProfileSheet = lazy(async () => {
  const module = await loadProfileSheet();
  return { default: module.TreeholeAvatarSheet };
});

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  window.prompt('复制日历订阅链接', text);
}

export function MePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const avatarSheetOpen = useUiStore((state) => state.treeholeAvatarSheetOpen);
  const openAvatarSheet = useUiStore((state) => state.openTreeholeAvatarSheet);
  const logout = useAuthStore((state) => state.logout);
  const profileQuery = useUserInfoQuery();
  const calendarLinkMutation = useCalendarSubscriptionLinkMutation();
  const treeholeUnreadQuery = useTreeholeUnreadNotificationCountQuery();
  const [profileSheetRequested, setProfileSheetRequested] = useState(false);
  const treeholeUnreadCount = treeholeUnreadQuery.data?.unreadCount ?? 0;

  useEffect(() => setActiveTab('me'), [setActiveTab]);

  useEffect(() => {
    if (!avatarSheetOpen) return;
    setProfileSheetRequested(true);
    void loadProfileSheet();
  }, [avatarSheetOpen]);

  const handleOpenProfile = () => {
    setProfileSheetRequested(true);
    void loadProfileSheet();
    openAvatarSheet();
  };

  const handleCopyCalendarLink = async () => {
    try {
      const result = await calendarLinkMutation.mutateAsync();
      await copyText(result.url);
      pushToast({ title: '已复制', variant: 'success' });
    } catch {
      pushToast({ title: '复制失败，请重试', variant: 'error' });
    }
  };

  const handleLogout = () => {
    queryClient.clear();
    logout();
    navigate(appRoutes.login, { replace: true });
  };

  return (
    <div className="page-stack-mobile">
      <Card className="overflow-hidden p-0">
        {profileQuery.isLoading ? (
          <div className="space-y-2 px-4 py-4" aria-hidden="true">
            <div className="h-5 w-24 animate-pulse rounded bg-shell-strong" />
            <div className="h-4 w-40 animate-pulse rounded bg-shell-strong" />
          </div>
        ) : profileQuery.isError ? (
          <p className="px-4 py-4 text-sm text-error">资料加载失败，请重试</p>
        ) : (
          <button
            aria-label="编辑资料"
            className="flex min-h-20 w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-tint-soft"
            type="button"
            onClick={handleOpenProfile}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{profileQuery.data?.name}</p>
              <p className="mt-1 truncate text-sm text-muted">{[profileQuery.data?.studentId, profileQuery.data?.className].filter(Boolean).join(' · ')}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-muted">
              <Pencil aria-hidden="true" className="size-4" />
              编辑资料
            </span>
          </button>
        )}
      </Card>

      <Card className="divide-y divide-line p-0">
        <button className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-tint-soft" type="button" onClick={() => navigate(appRoutes.meDiscover)}>
          <Utensils aria-hidden="true" className="size-[1.125rem] text-muted" />
          <span className="flex-1 text-sm font-medium">我的好饭</span>
          <ChevronRight aria-hidden="true" className="size-4 text-muted" />
        </button>
        <button className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-tint-soft" type="button" onClick={() => navigate(appRoutes.meTreehole)}>
          <MessageCircle aria-hidden="true" className="size-[1.125rem] text-muted" />
          <span className="flex-1 text-sm font-medium">我的树洞</span>
          {treeholeUnreadCount > 0 ? (
            <span className="min-w-5 rounded-full bg-error px-1.5 py-0.5 text-center text-[0.6875rem] font-medium text-white">{treeholeUnreadCount > 99 ? '99+' : treeholeUnreadCount}</span>
          ) : null}
          <ChevronRight aria-hidden="true" className="size-4 text-muted" />
        </button>
        <button
          className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-tint-soft disabled:opacity-50"
          disabled={calendarLinkMutation.isPending}
          type="button"
          onClick={() => void handleCopyCalendarLink()}
        >
          <CalendarDays aria-hidden="true" className="size-[1.125rem] text-muted" />
          <span className="flex-1 text-sm font-medium">日历订阅</span>
          <span className="text-xs text-muted">{calendarLinkMutation.isPending ? '处理中…' : '复制链接'}</span>
        </button>
      </Card>

      <Card className="overflow-hidden p-0">
        <button
          className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-error transition-colors hover:bg-error-soft"
          type="button"
          onClick={handleLogout}
        >
          <LogOut aria-hidden="true" className="size-[1.125rem]" />
          退出登录
        </button>
      </Card>

      {profileSheetRequested ? <Suspense fallback={null}><LazyProfileSheet /></Suspense> : null}
    </div>
  );
}
