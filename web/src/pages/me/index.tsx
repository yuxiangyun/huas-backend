import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import { useMyDiscoverInfinitePostsQuery } from '@/entities/discover/api/discover-queries';
import { useAuthStore } from '@/entities/auth/model/auth-store';
import { refreshUserInfo, useUserInfoQuery } from '@/entities/user/api/user-queries';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/page-header';
import { MyPostsPanel } from '@/widgets/my-posts-panel/my-posts-panel';
import { ProfileSummary } from '@/widgets/profile-summary/profile-summary';

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
  const averageRating = myPosts.length
    ? myPosts.reduce((sum, post) => sum + post.rating.average, 0) / myPosts.length
    : 0;
  const categoryCounts = myPosts.reduce<Record<string, number>>((acc, post) => {
    acc[post.category] = (acc[post.category] || 0) + 1;
    return acc;
  }, {});
  const topCategoryEntry = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

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
    <div className="page-stack-mobile">
      <PageHeader
        action={(
          <Button
            className="min-w-[5.25rem]"
            size="sm"
            type="button"
            variant="subtle"
            onClick={() => void handleRefreshAll()}
          >
            {isRefreshing ? '刷新中' : '刷新'}
          </Button>
        )}
        compact
        description="这里应该只放真实有用的内容: 资料、发布记录、同步状态和账号操作。"
        eyebrow="profile"
        title="我的"
      />

      {profileQuery.isError ? (
        <Card className="space-y-2">
          <p className="text-base font-semibold text-ink">资料加载失败</p>
          <p className="text-sm leading-6 text-muted">
            {profileQuery.error instanceof Error ? profileQuery.error.message : '请求失败'}
          </p>
        </Card>
      ) : null}

      <ProfileSummary loading={profileQuery.isLoading} profile={profileQuery.data ?? null} />

      <section className="page-stack-mobile">
        <Card className="space-y-3 bg-card-strong">
          <div className="space-y-1">
            <p className="text-base font-semibold text-ink">发现美食</p>
            <p className="text-sm leading-6 text-muted">
              这里先集中放 Discover 相关内容。后面扩展其他功能时，“我的”页会继续按模块往下加。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <div className="rounded-[1.1rem] bg-white/78 px-3.5 py-3 ring-1 ring-line">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">发布数</p>
              <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-ink">{myPosts.length}</p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-muted">目前累计公开推荐</p>
            </div>
            <div className="rounded-[1.1rem] bg-white/78 px-3.5 py-3 ring-1 ring-line">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">平均评分</p>
              <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-ink">
                {myPosts.length ? averageRating.toFixed(1) : '--'}
              </p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-muted">按全部帖子当前评分均值计算</p>
            </div>
            <div className="col-span-2 rounded-[1.1rem] bg-white/78 px-3.5 py-3 ring-1 ring-line sm:col-span-1">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">最常发布</p>
              <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-ink">
                {topCategoryEntry?.[0] || '--'}
              </p>
              <p className="mt-1.5 text-[0.82rem] leading-5 text-muted">
                {topCategoryEntry ? `${topCategoryEntry[1]} 次` : '还没有足够数据'}
              </p>
            </div>
          </div>
        </Card>

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
      </section>

      <Card className="space-y-3 bg-card-strong">
        <div className="space-y-1">
          <p className="text-base font-semibold text-ink">账号</p>
          <p className="text-sm leading-6 text-muted">
            这里只保留账号操作，避免把不同功能模块混在一起。
          </p>
        </div>

        <Button
          fullWidth
          size="md"
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
      </Card>
    </div>
  );
}
