import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowTrendingSparkle20Filled } from '@fluentui/react-icons/svg/arrow-trending-sparkle';
import { BowlChopsticks20Filled } from '@fluentui/react-icons/svg/bowl-chopsticks';
import { Chat20Filled } from '@fluentui/react-icons/svg/chat';
import { ContactCard20Filled } from '@fluentui/react-icons/svg/contact-card';
import { DoorArrowRight20Filled } from '@fluentui/react-icons/svg/door-arrow-right';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import {
  useTreeholeAvatarQuery,
  useTreeholeUnreadNotificationCountQuery,
} from '@/entities/treehole/api/treehole-queries';
import { useUserInfoQuery } from '@/entities/user/api/user-queries';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/page-header';
import { IconBubble } from '@/shared/ui/page-ornament';
import { TreeholeAvatar } from '@/shared/ui/treehole-avatar';

export function MePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const logout = useAuthStore((state) => state.logout);
  const profileQuery = useUserInfoQuery();
  const treeholeAvatarQuery = useTreeholeAvatarQuery();
  const treeholeUnreadQuery = useTreeholeUnreadNotificationCountQuery();
  const profile = profileQuery.data ?? null;
  const treeholeAvatarUrl = treeholeAvatarQuery.data?.avatarUrl ?? null;
  const treeholeUnreadCount = treeholeUnreadQuery.data?.unreadCount ?? 0;

  useEffect(() => {
    setActiveTab('me');
  }, [setActiveTab]);

  const quickActions = [
    {
      id: 'discover',
      buttonLabel: '进入',
      chip: '内容',
      description: '查看我的发布和评分趋势',
      glowClass: 'bg-[#f0cf95]/62',
      icon: <BowlChopsticks20Filled aria-hidden="true" className="size-5" />,
      accent: <ArrowTrendingSparkle20Filled aria-hidden="true" className="size-4" />,
      onClick: () => navigate(appRoutes.meDiscover),
      unreadCount: 0,
      title: '拍好饭',
      tone: 'amber' as const,
      variant: 'secondary' as const,
    },
    {
      id: 'treehole',
      buttonLabel: '进入',
      chip: '匿名',
      description: '查看我的匿名发言和互动',
      glowClass: 'bg-[#c4d7fb]/62',
      icon: <Chat20Filled aria-hidden="true" className="size-5" />,
      accent: <ContactCard20Filled aria-hidden="true" className="size-4" />,
      onClick: () => navigate(appRoutes.meTreehole),
      unreadCount: treeholeUnreadCount,
      title: '树洞',
      tone: 'blue' as const,
      variant: 'secondary' as const,
    },
    {
      id: 'account',
      buttonLabel: '退出',
      chip: '账号',
      description: '管理当前登录状态',
      glowClass: 'bg-[#d9e1e9]/72',
      icon: (
        <TreeholeAvatar
          alt="我的头像"
          className="size-full rounded-[0.9rem] ring-0"
          src={treeholeAvatarUrl}
        />
      ),
      accent: <DoorArrowRight20Filled aria-hidden="true" className="size-4" />,
      onClick: () => {
        queryClient.clear();
        logout();
        pushToast({
          title: '已退出登录',
          variant: 'info',
        });
        navigate(appRoutes.login, { replace: true });
      },
      unreadCount: 0,
      title: '账号',
      tone: 'slate' as const,
      variant: 'subtle' as const,
    },
  ];

  return (
    <div className="page-stack-mobile">
      <PageHeader
        compact
        description="常用入口"
        title="我的"
      />

      {profileQuery.isError ? (
        <Card className="space-y-2 bg-card-strong">
          <p className="text-base font-semibold text-ink">资料同步失败</p>
          <p className="text-sm leading-6 text-muted">
            {profileQuery.error instanceof Error ? profileQuery.error.message : '用户信息加载失败'}
          </p>
        </Card>
      ) : null}

      {quickActions.map((action) => (
        <Card key={action.id} className="relative overflow-hidden bg-card-strong p-4 sm:p-5">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.4))] sm:block" />
          <div className={`pointer-events-none absolute -right-10 top-1/2 hidden size-28 -translate-y-1/2 rounded-full blur-3xl sm:block ${action.glowClass}`} />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3.5">
              <IconBubble
                icon={action.icon}
                size="lg"
                tone={action.tone}
              />

              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-ink">{action.title}</p>
                  <span className="rounded-pill bg-white/78 px-2.5 py-1 text-[0.72rem] font-medium text-muted ring-1 ring-line">
                    {action.chip}
                  </span>
                  {action.unreadCount > 0 ? (
                    <span className="rounded-pill bg-error px-2.5 py-1 text-[0.72rem] font-medium text-white">
                      {action.unreadCount > 99 ? '99+' : action.unreadCount}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm leading-6 text-muted">
                  {action.description}
                </p>
              </div>
            </div>

            <div className="flex w-full items-center gap-3 sm:w-auto sm:self-auto">
              <IconBubble
                className="hidden sm:inline-flex"
                icon={action.accent}
                size="sm"
                tone={action.tone}
              />
              <Button
                className="w-full sm:min-w-[6.75rem]"
                size="sm"
                type="button"
                variant={action.variant}
                onClick={action.onClick}
              >
                {action.buttonLabel}
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
