/**
 * [INPUT]: 依赖当前用户 Discover 无限列表、个人内容面板与 React Router 导航
 * [OUTPUT]: 对外提供 MeDiscoverPage，展示当前用户的好饭发布列表
 * [POS]: pages/me-discover 的路由编排器，不重复列表统计或详情卡片
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { useUiStore } from '@/app/state/ui-store';
import { useMyDiscoverInfinitePostsQuery } from '@/entities/discover/api/discover-queries';
import { IconButton } from '@/shared/ui/icon-button';
import { PageHeader } from '@/shared/ui/page-header';
import { MyPostsPanel } from '@/widgets/my-posts-panel/my-posts-panel';

export function MeDiscoverPage() {
  const navigate = useNavigate();
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const myPostsQuery = useMyDiscoverInfinitePostsQuery({ pageSize: 10 });
  const myPosts = myPostsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => setActiveTab('me'), [setActiveTab]);

  return (
    <div className="page-stack-mobile">
      <PageHeader
        action={<IconButton icon={<ArrowLeft aria-hidden="true" className="size-4" />} label="返回" size="sm" onClick={() => navigate(appRoutes.me)} />}
        compact
        title="我的好饭"
      />

      {myPostsQuery.isError ? <p className="text-sm text-error">加载失败，请重试</p> : null}

      <MyPostsPanel
        hasMore={Boolean(myPostsQuery.hasNextPage)}
        loading={myPostsQuery.isLoading}
        loadingMore={myPostsQuery.isFetchingNextPage}
        posts={myPosts}
        onLoadMore={() => void myPostsQuery.fetchNextPage()}
        onOpenPost={(postId) => navigate(`${appRoutes.discover}?postId=${postId}`)}
      />
    </div>
  );
}
