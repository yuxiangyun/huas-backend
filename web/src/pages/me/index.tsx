import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import { useMyDiscoverInfinitePostsQuery } from '@/entities/discover/api/discover-queries';
import { refreshUserInfo, useUserInfoQuery } from '@/entities/user/api/user-queries';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { MyPostsPanel } from '@/widgets/my-posts-panel/my-posts-panel';
import { ProfileSummary } from '@/widgets/profile-summary/profile-summary';
import { useAuthStore } from '@/entities/auth/model/auth-store';

export function MePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const logout = useAuthStore((state) => state.logout);
  const profileQuery = useUserInfoQuery();
  const myPostsQuery = useMyDiscoverInfinitePostsQuery({ pageSize: 10 });
  const myPosts = myPostsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const isRefreshing = profileQuery.isRefetching || myPostsQuery.isRefetching;
  const upcomingServices = [
    { title: '课表', description: '一周安排和节次提醒' },
    { title: '成绩', description: '学期成绩与绩点查看' },
    { title: '一卡通', description: '余额、消费和充值记录' },
    { title: '设置', description: '通知、反馈和偏好项' },
  ];

  const handleRefreshAll = async () => {
    const [profileResult, postsResult] = await Promise.allSettled([
      refreshUserInfo(queryClient),
      myPostsQuery.refetch(),
    ]);

    if (profileResult.status === 'rejected' || postsResult.status === 'rejected') {
      pushToast({
        title: '刷新失败',
        message: '有部分数据刷新失败，请稍后再试。',
        variant: 'error',
      });
      return;
    }

    pushToast({
      title: '已刷新',
      message: '个人资料和我的发布都已更新。',
      variant: 'success',
    });
  };

  useEffect(() => {
    setActiveTab('me');
  }, [setActiveTab]);

  return (
    <div className="space-y-6">
      <header className="space-y-3 px-1 pt-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-muted">
              profile
            </p>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-ink">我的</h1>
            <p className="max-w-sm text-sm leading-7 text-muted">
              这里放你的资料、发布记录，以及之后常用的校园服务。
            </p>
          </div>
          <Button
            className="min-w-[6.5rem]"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => void handleRefreshAll()}
          >
            {isRefreshing ? '刷新中...' : '全部刷新'}
          </Button>
        </div>
      </header>

      {profileQuery.isError ? (
        <Card className="space-y-2">
          <p className="text-base font-semibold text-ink">资料加载失败</p>
          <p className="text-sm leading-6 text-muted">
            {profileQuery.error instanceof Error ? profileQuery.error.message : '请求失败'}
          </p>
        </Card>
      ) : null}

      <ProfileSummary loading={profileQuery.isLoading} profile={profileQuery.data ?? null} />

      {myPostsQuery.isError ? (
        <Card className="space-y-2">
          <p className="text-base font-semibold text-ink">我的发布加载失败</p>
          <p className="text-sm leading-6 text-muted">
            {myPostsQuery.error instanceof Error ? myPostsQuery.error.message : '请求失败'}
          </p>
        </Card>
      ) : null}

      <MyPostsPanel
        hasMore={Boolean(myPostsQuery.hasNextPage)}
        loading={myPostsQuery.isLoading}
        loadingMore={myPostsQuery.isFetchingNextPage}
        posts={myPosts}
        refreshing={myPostsQuery.isRefetching}
        onLoadMore={() => void myPostsQuery.fetchNextPage()}
        onOpenPost={(postId) => navigate(`${appRoutes.discover}?postId=${postId}`)}
        onRefresh={() => void myPostsQuery.refetch()}
      />

      <Card className="space-y-4 bg-card-strong">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-base font-semibold text-ink">更多服务</p>
            <p className="text-sm leading-6 text-muted">
              常用校园功能会逐步集中到这里。
            </p>
          </div>
          <span className="rounded-pill bg-white/80 px-3 py-1 text-xs font-medium text-muted ring-1 ring-line">
            即将加入
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {upcomingServices.map((service) => (
            <div
              key={service.title}
              className="rounded-[1.35rem] bg-white/78 px-4 py-4 ring-1 ring-line"
            >
              <p className="text-sm font-semibold text-ink">{service.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{service.description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Button
        fullWidth
        type="button"
        variant="secondary"
        onClick={() => {
          queryClient.clear();
          logout();
          pushToast({
            title: '已退出登录',
            variant: 'info',
          });
          navigate(appRoutes.login, { replace: true });
        }}
      >
        退出登录
      </Button>
    </div>
  );
}
