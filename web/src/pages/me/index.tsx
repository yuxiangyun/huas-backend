/**
 * [INPUT]: 依赖校园/社区资料、Social 未读、个人内容路由、日历订阅与认证状态
 * [OUTPUT]: 对外提供 MePage，以共享 Social 字标、公开社区身份、内容入口和账户动作组成个人页
 * [POS]: pages/me 的页面编排器，不使用宣传卡片，不持有底层 HTTP 协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Bell, CalendarDays, ChevronRight, LogOut, MessageCircle, Pencil, Send, Utensils } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import { useCommunityProfileQuery } from '@/entities/community/api/community-queries';
import { useMessagingUnreadCountQuery } from '@/entities/messaging/api/messaging-queries';
import { useNotificationUnreadCountQuery } from '@/entities/notifications/api/notification-queries';
import { useCalendarSubscriptionLinkMutation, useUserInfoQuery } from '@/entities/user/api/user-queries';
import { Card } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/page-header';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
import { SocialPageTitle } from '@/shared/ui/social-page-title';
import { UnreadBadge } from '@/shared/ui/unread-badge';

const loadCommunityProfileDialog = () => import('@/widgets/community-profile-dialog/community-profile-dialog');
const LazyCommunityProfileDialog = lazy(async () => {
  const module = await loadCommunityProfileDialog();
  return { default: module.CommunityProfileDialog };
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
  const profileDialogOpen = useUiStore((state) => state.communityProfileDialogOpen);
  const openProfileDialog = useUiStore((state) => state.openCommunityProfileDialog);
  const logout = useAuthStore((state) => state.logout);
  const profileQuery = useUserInfoQuery();
  const communityProfileQuery = useCommunityProfileQuery();
  const calendarLinkMutation = useCalendarSubscriptionLinkMutation();
  const messagingUnreadQuery = useMessagingUnreadCountQuery();
  const notificationUnreadQuery = useNotificationUnreadCountQuery();
  const [profileDialogRequested, setProfileDialogRequested] = useState(false);
  const messagingUnreadCount = messagingUnreadQuery.data?.unreadCount ?? 0;
  const notificationUnreadCount = notificationUnreadQuery.data?.unreadCount ?? 0;

  useEffect(() => setActiveTab('me'), [setActiveTab]);

  useEffect(() => {
    if (!profileDialogOpen) return;
    setProfileDialogRequested(true);
    void loadCommunityProfileDialog();
  }, [profileDialogOpen]);

  const handleOpenProfile = () => {
    setProfileDialogRequested(true);
    void loadCommunityProfileDialog();
    openProfileDialog();
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
      <PageHeader className="py-4" compact title={<SocialPageTitle>我的</SocialPageTitle>} />
      <Card className="overflow-hidden p-0">
        {profileQuery.isLoading || communityProfileQuery.isLoading ? (
          <div className="space-y-2 px-4 py-4" aria-hidden="true">
            <div className="h-5 w-24 animate-pulse rounded bg-shell-strong" />
            <div className="h-4 w-40 animate-pulse rounded bg-shell-strong" />
          </div>
        ) : profileQuery.isError || communityProfileQuery.isError ? (
          <p className="px-4 py-4 text-sm text-error">资料加载失败，请重试</p>
        ) : (
          <button
            aria-label="编辑资料"
            className="flex min-h-24 w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-tint-soft"
            type="button"
            onClick={handleOpenProfile}
          >
            <CommunityAvatar
              alt="我的社区头像"
              className="size-14"
              src={communityProfileQuery.data?.avatarUrl}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{communityProfileQuery.data?.displayName}</p>
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
          <ChevronRight aria-hidden="true" className="size-4 text-muted" />
        </button>
        <button className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-tint-soft" type="button" onClick={() => navigate(appRoutes.messages)}>
          <Send aria-hidden="true" className="size-[1.125rem] text-muted" />
          <span className="flex-1 text-sm font-medium">私信</span>
          <UnreadBadge count={messagingUnreadCount} />
          <ChevronRight aria-hidden="true" className="size-4 text-muted" />
        </button>
        <button className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-tint-soft" type="button" onClick={() => navigate(`${appRoutes.messages}?tab=notifications`)}>
          <Bell aria-hidden="true" className="size-[1.125rem] text-muted" />
          <span className="flex-1 text-sm font-medium">互动通知</span>
          <UnreadBadge count={notificationUnreadCount} />
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

      {profileDialogRequested ? <Suspense fallback={null}><LazyCommunityProfileDialog /></Suspense> : null}
    </div>
  );
}
