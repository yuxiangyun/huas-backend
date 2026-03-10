import { lazy, startTransition, Suspense, useEffect, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import { useDiscoverMetaQuery } from '@/entities/discover/api/discover-queries';
import { discoverQueryKeys } from '@/entities/discover/model/discover-query-keys';
import {
  DISCOVER_CATEGORIES,
  type DiscoverCategory,
  type DiscoverSort,
} from '@/entities/discover/model/discover-types';
import { PageHeader } from '@/shared/ui/page-header';
import { PageOrnament } from '@/shared/ui/page-ornament';
import { DiscoverFeed } from '@/widgets/discover-feed/discover-feed';
import { Apps20Filled } from '@fluentui/react-icons/svg/apps';
import { ArrowTrendingSparkle20Filled } from '@fluentui/react-icons/svg/arrow-trending-sparkle';
import { BowlChopsticks24Filled } from '@fluentui/react-icons/svg/bowl-chopsticks';

const loadDiscoverComposeSheet = () => import('@/widgets/discover-compose-sheet/discover-compose-sheet');
const loadDiscoverDetailSheet = () => import('@/widgets/discover-detail-sheet/discover-detail-sheet');

const LazyDiscoverComposeSheet = lazy(async () => {
  const module = await loadDiscoverComposeSheet();
  return { default: module.DiscoverComposeSheet };
});

const LazyDiscoverDetailSheet = lazy(async () => {
  const module = await loadDiscoverDetailSheet();
  return { default: module.DiscoverDetailSheet };
});

function parseSort(value: string | null): DiscoverSort {
  if (value === 'score' || value === 'recommended') return value;
  return 'latest';
}

function parseCategory(value: string | null): DiscoverCategory | 'all' {
  if (value === '1食堂' || value === '2食堂' || value === '3食堂' || value === '5食堂' || value === '校外' || value === '其他') {
    return value;
  }

  return 'all';
}

export function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const composeSheetOpen = useUiStore((state) => state.discoverComposeSheetOpen);
  const openComposeSheet = useUiStore((state) => state.openDiscoverComposeSheet);
  const metaQuery = useDiscoverMetaQuery();
  const [composeSheetRequested, setComposeSheetRequested] = useState(false);
  const [detailSheetRequested, setDetailSheetRequested] = useState(false);

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

      setSearchParams(nextParams);
    });
  }

  const handleRefreshDiscover = async () => {
    try {
      await queryClient.refetchQueries({
        queryKey: currentListQueryKey,
        exact: true,
        type: 'active',
      }, {
        throwOnError: true,
      });
      pushToast({
        title: '已刷新',
        variant: 'success',
      });
    } catch {
      pushToast({
        title: '刷新失败',
        variant: 'error',
      });
    }
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
      params.set('postId', String(nextPostId));
    });
  };

  return (
    <div className="page-stack-mobile">
      <PageHeader
        compact
        description="看推荐，也能发"
        eyebrow="discover"
        title="拍好饭"
        visual={(
          <PageOrnament
            badges={[
              {
                icon: <ArrowTrendingSparkle20Filled aria-hidden="true" className="size-3.5" />,
                label: '推荐',
                tone: 'rose',
              },
              {
                icon: <Apps20Filled aria-hidden="true" className="size-3.5" />,
                label: '分类',
                tone: 'blue',
              },
            ]}
            className="w-full sm:w-[13rem]"
            compact
            icon={<BowlChopsticks24Filled aria-hidden="true" className="size-6" />}
            label="Campus Picks"
            title="推荐、分类、发布"
            tone="amber"
          />
        )}
      />

      <DiscoverFeed
        categories={metaQuery.data?.categories ?? DISCOVER_CATEGORIES}
        category={category}
        sort={sort}
        onComposeClick={handleOpenComposeSheet}
        onRefreshClick={() => void handleRefreshDiscover()}
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
            {metaQuery.error instanceof Error ? metaQuery.error.message : '分类信息加载失败'}
          </div>
        </div>
      ) : null}

      {composeSheetRequested ? (
        <Suspense fallback={null}>
          <LazyDiscoverComposeSheet />
        </Suspense>
      ) : null}

      {detailSheetRequested ? (
        <Suspense fallback={null}>
          <LazyDiscoverDetailSheet
            postId={postId}
            onClose={() =>
              patchSearchParams((params) => {
                params.delete('postId');
              })
            }
          />
        </Suspense>
      ) : null}
    </div>
  );
}
