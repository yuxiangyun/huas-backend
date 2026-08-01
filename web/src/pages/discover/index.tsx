/**
 * [INPUT]: 依赖 Discover 元数据/列表缓存、URL 查询参数与发布/详情弹层加载器
 * [OUTPUT]: 对外提供 DiscoverPage，以紧凑统一的 Social 顶栏编排拍好饭排序、分类、刷新、发布与详情路由状态
 * [POS]: pages/discover 的路由级组装器，原子维护帖子详情与公共资料互斥并将数据语义下沉至 entities/widgets
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { lazy, startTransition, Suspense, useEffect, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { appRoutes } from '@/app/router/paths';
import { useUiStore } from '@/app/state/ui-store';
import { useDiscoverMetaQuery } from '@/entities/discover/api/discover-queries';
import { discoverQueryKeys } from '@/entities/discover/model/discover-query-keys';
import {
  DISCOVER_CATEGORIES,
  type DiscoverCategory,
  type DiscoverSort,
} from '@/entities/discover/model/discover-types';
import { DiscoverFeed } from '@/widgets/discover-feed/discover-feed';
import { IconButton } from '@/shared/ui/icon-button';
import { PageHeader } from '@/shared/ui/page-header';
import { SocialPageTitle } from '@/shared/ui/social-page-title';
import { LazyTaskFallback } from '@/shared/ui/lazy-task-fallback';
import { selectSocialPost } from '@/pages/social-route-state';

const loadDiscoverComposeSheet = () => import('@/widgets/discover-compose-sheet/discover-compose-sheet');
const loadDiscoverDetailSheet = () => import('@/widgets/discover-detail-sheet/discover-detail-sheet');
const loadPublicProfileDialog = () => import('@/widgets/public-profile-dialog/public-profile-dialog');

const LazyDiscoverComposeSheet = lazy(async () => {
  const module = await loadDiscoverComposeSheet();
  return { default: module.DiscoverComposeSheet };
});

const LazyDiscoverDetailSheet = lazy(async () => {
  const module = await loadDiscoverDetailSheet();
  return { default: module.DiscoverDetailSheet };
});

const LazyPublicProfileDialog = lazy(async () => {
  const module = await loadPublicProfileDialog();
  return { default: module.PublicProfileDialog };
});

function parseSort(value: string | null): DiscoverSort {
  if (value === 'popular' || value === 'recommended') return value;
  return 'latest';
}

function parseCategory(value: string | null): DiscoverCategory | 'all' {
  if (value === '1食堂' || value === '2食堂' || value === '3食堂' || value === '5食堂' || value === '校外' || value === '其他') {
    return value;
  }

  return 'all';
}

export function DiscoverPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const composeSheetOpen = useUiStore((state) => state.discoverComposeSheetOpen);
  const openComposeSheet = useUiStore((state) => state.openDiscoverComposeSheet);
  const metaQuery = useDiscoverMetaQuery();
  const [composeSheetRequested, setComposeSheetRequested] = useState(false);
  const [detailSheetRequested, setDetailSheetRequested] = useState(false);
  const [profileDialogRequested, setProfileDialogRequested] = useState(false);

  useEffect(() => {
    setActiveTab('discover');
  }, [setActiveTab]);

  const sort = parseSort(searchParams.get('sort'));
  const category = parseCategory(searchParams.get('category'));
  const currentListQueryKey = discoverQueryKeys.list({
    sort,
    category: category === 'all' ? undefined : category,
    pageSize: 12,
  });
  const rawPostId = Number(searchParams.get('postId'));
  const postId = Number.isInteger(rawPostId) && rawPostId > 0 ? rawPostId : null;
  const rawProfileUserId = Number(searchParams.get('profileUserId'));
  const profileUserId = Number.isInteger(rawProfileUserId) && rawProfileUserId > 0 ? rawProfileUserId : null;
  const discoverFetchingCount = useIsFetching({ queryKey: currentListQueryKey, exact: true });

  useEffect(() => {
    if (!composeSheetOpen) return;
    setComposeSheetRequested(true);
    void loadDiscoverComposeSheet();
  }, [composeSheetOpen]);

  useEffect(() => {
    if (postId === null) return;
    setDetailSheetRequested(true);
    void loadDiscoverDetailSheet();
  }, [postId]);

  useEffect(() => {
    if (profileUserId === null) return;
    setProfileDialogRequested(true);
    void loadPublicProfileDialog();
  }, [profileUserId]);

  function patchSearchParams(
    patcher: (params: URLSearchParams) => void
  ) {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams);
      patcher(nextParams);

      if (nextParams.get('sort') === 'latest') {
        nextParams.delete('sort');
      }

      if (nextParams.get('category') === 'all') {
        nextParams.delete('category');
      }

      if (!nextParams.get('postId')) {
        nextParams.delete('postId');
      }

      if (!nextParams.get('profileUserId')) {
        nextParams.delete('profileUserId');
      }

      setSearchParams(nextParams);
    });
  }

  const handleRefreshDiscover = () => {
    void queryClient.refetchQueries({
      queryKey: currentListQueryKey,
      exact: true,
      type: 'active',
    });
  };

  const handleOpenComposeSheet = () => {
    setComposeSheetRequested(true);
    void loadDiscoverComposeSheet();
    openComposeSheet();
  };

  const handleOpenPost = (nextPostId: number) => {
    setDetailSheetRequested(true);
    void loadDiscoverDetailSheet();
    patchSearchParams((params) => {
      selectSocialPost(params, nextPostId);
    });
  };

  const handleOpenProfile = (userId: number) => {
    setProfileDialogRequested(true);
    void loadPublicProfileDialog();
    patchSearchParams((params) => {
      params.set('profileUserId', String(userId));
      params.delete('postId');
    });
  };

  return (
    <div className="-mx-4 space-y-0 bg-white sm:mx-0 sm:bg-transparent">
      <PageHeader
        action={(
          <IconButton
            className="-mr-1 text-ink hover:bg-[#f2f2f2]"
            icon={<Plus aria-hidden="true" className="size-6" strokeWidth={1.8} />}
            label="发布好饭"
            size="md"
            variant="ghost"
            onClick={handleOpenComposeSheet}
          />
        )}
        className="mx-auto w-full max-w-[34rem] px-4 pb-3 pt-0 sm:px-0 sm:pb-4 sm:pt-0"
        compact
        title={<SocialPageTitle variant="brand">好饭</SocialPageTitle>}
      />
      <DiscoverFeed
        categories={metaQuery.data?.categories ?? DISCOVER_CATEGORIES}
        category={category}
        sort={sort}
        onComposeClick={handleOpenComposeSheet}
        onMessageAuthor={(userId) => navigate(`${appRoutes.messages}?userId=${userId}`)}
        onOpenProfile={handleOpenProfile}
        onRefreshClick={handleRefreshDiscover}
        refreshing={discoverFetchingCount > 0}
        onCategoryChange={(nextCategory) =>
          patchSearchParams((params) => {
            params.set('category', nextCategory);
            params.delete('postId');
          })
        }
        onOpenPost={handleOpenPost}
        onSortChange={(nextSort) =>
          patchSearchParams((params) => {
            params.set('sort', nextSort);
            params.delete('postId');
          })
        }
      />

      {metaQuery.isError ? (
        <div className="px-1">
          <div className="rounded-[1.2rem] bg-error-soft px-4 py-3 text-sm leading-6 text-error">
            分类加载失败，请重试
          </div>
        </div>
      ) : null}

      {composeSheetRequested ? (
        <Suspense fallback={composeSheetOpen ? <LazyTaskFallback label="发布好饭" /> : null}>
          <LazyDiscoverComposeSheet />
        </Suspense>
      ) : null}

      {detailSheetRequested ? (
        <Suspense fallback={postId !== null ? <LazyTaskFallback label="好饭详情" /> : null}>
          <LazyDiscoverDetailSheet
            postId={postId}
            onMessageAuthor={(userId) => navigate(`${appRoutes.messages}?userId=${userId}`)}
            onOpenProfile={handleOpenProfile}
            onClose={() =>
              patchSearchParams((params) => {
                params.delete('postId');
              })
            }
          />
        </Suspense>
      ) : null}

      {profileDialogRequested ? (
        <Suspense fallback={profileUserId !== null ? <LazyTaskFallback label="用户资料" /> : null}>
          <LazyPublicProfileDialog
            userId={profileUserId}
            onClose={() => patchSearchParams((params) => params.delete('profileUserId'))}
            onMessage={(userId) => navigate(`${appRoutes.messages}?userId=${userId}`)}
            onOpenDiscoverPost={(nextPostId) => handleOpenPost(nextPostId)}
            onOpenTreeholePost={(nextPostId) => navigate(`${appRoutes.treehole}?postId=${nextPostId}`)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
