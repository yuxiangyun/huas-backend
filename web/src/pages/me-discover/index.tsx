import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { useUiStore } from '@/app/state/ui-store';
import { useMyDiscoverInfinitePostsQuery } from '@/entities/discover/api/discover-queries';
import { Card } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/page-header';
import { MyPostsPanel } from '@/widgets/my-posts-panel/my-posts-panel';

export function MeDiscoverPage() {
  const navigate = useNavigate();
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const myPostsQuery = useMyDiscoverInfinitePostsQuery({ pageSize: 10 });
  const myPosts = myPostsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const totalPosts = myPostsQuery.data?.pages[0]?.total ?? myPosts.length;
  const averageRating = myPosts.length
    ? myPosts.reduce((sum, post) => sum + post.rating.average, 0) / myPosts.length
    : 0;
  const categoryCounts = myPosts.reduce<Record<string, number>>((acc, post) => {
    acc[post.category] = (acc[post.category] || 0) + 1;
    return acc;
  }, {});
  const topCategoryEntry = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

  useEffect(() => {
    setActiveTab('me');
  }, [setActiveTab]);

  return (
    <div className="page-stack-mobile">
      <PageHeader
        compact
        description="我的发布"
        eyebrow="discover"
        title="拍好饭"
      />

      <Card className="space-y-3 bg-card-strong">
        <div className="space-y-1">
          <p className="text-base font-semibold text-ink">概览</p>
          <p className="text-sm leading-6 text-muted">
            只看自己的内容
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <div className="rounded-[1.1rem] bg-white/78 px-3.5 py-3 ring-1 ring-line">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">发布数</p>
            <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-ink">{totalPosts}</p>
            <p className="mt-1.5 text-[0.82rem] leading-5 text-muted">累计</p>
          </div>
          <div className="rounded-[1.1rem] bg-white/78 px-3.5 py-3 ring-1 ring-line">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">平均评分</p>
            <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-ink">
              {myPosts.length ? averageRating.toFixed(1) : '--'}
            </p>
            <p className="mt-1.5 text-[0.82rem] leading-5 text-muted">已加载</p>
          </div>
          <div className="col-span-2 rounded-[1.1rem] bg-white/78 px-3.5 py-3 ring-1 ring-line sm:col-span-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">最常发布</p>
            <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-ink">
              {topCategoryEntry?.[0] || '--'}
            </p>
            <p className="mt-1.5 text-[0.82rem] leading-5 text-muted">
              {topCategoryEntry ? `已加载 ${topCategoryEntry[1]} 次` : '暂无'}
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
        totalCount={totalPosts}
        refreshing={myPostsQuery.isRefetching}
        onLoadMore={() => void myPostsQuery.fetchNextPage()}
        onOpenPost={(postId) => navigate(`${appRoutes.discover}?postId=${postId}`)}
        onRefresh={() => void myPostsQuery.refetch()}
      />
    </div>
  );
}
