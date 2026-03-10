import { startTransition, useEffect } from 'react';
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
import { ComposeFab } from '@/features/discover-create-post/ui/compose-fab';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { DiscoverComposeSheet } from '@/widgets/discover-compose-sheet/discover-compose-sheet';
import { DiscoverDetailSheet } from '@/widgets/discover-detail-sheet/discover-detail-sheet';
import { DiscoverFeed } from '@/widgets/discover-feed/discover-feed';

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
  const openComposeSheet = useUiStore((state) => state.openComposeSheet);
  const metaQuery = useDiscoverMetaQuery();
  const discoverFetchingCount = useIsFetching({ queryKey: discoverQueryKeys.all });

  useEffect(() => {
    setActiveTab('discover');
  }, [setActiveTab]);

  const sort = parseSort(searchParams.get('sort'));
  const category = parseCategory(searchParams.get('category'));
  const rawPostId = Number(searchParams.get('postId'));
  const postId = Number.isInteger(rawPostId) && rawPostId > 0 ? rawPostId : null;

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
      await queryClient.invalidateQueries({ queryKey: discoverQueryKeys.all });
      pushToast({
        title: '内容已更新',
        message: '最新推荐已经同步完成。',
        variant: 'success',
      });
    } catch {
      pushToast({
        title: '刷新失败',
        message: '请稍后再试。',
        variant: 'error',
      });
    }
  };

  return (
    <div className="page-stack-mobile">
      <PageHeader
        action={(
          <Button
            className="min-w-[4.5rem]"
            size="sm"
            type="button"
            variant="subtle"
            onClick={() => void handleRefreshDiscover()}
          >
            {discoverFetchingCount > 0 ? '刷新中' : '刷新'}
          </Button>
        )}
        compact
        description="看今天吃什么，也把你觉得值得的一顿分享出来。"
        eyebrow="discover"
        title="拍好饭"
      />

      <DiscoverFeed
        categories={metaQuery.data?.categories ?? DISCOVER_CATEGORIES}
        category={category}
        sort={sort}
        onCategoryChange={(nextCategory) =>
          patchSearchParams((params) => {
            params.set('category', nextCategory);
            params.delete('postId');
          })
        }
        onOpenPost={(nextPostId) =>
          patchSearchParams((params) => {
            params.set('postId', String(nextPostId));
          })
        }
        onSortChange={(nextSort) =>
          patchSearchParams((params) => {
            params.set('sort', nextSort);
            params.delete('postId');
          })
        }
      />

      {metaQuery.isError ? (
        <div className="px-1">
          <div className="rounded-[1.2rem] bg-tint-soft px-4 py-3 text-sm leading-6 text-[#7e3925]">
            {metaQuery.error instanceof Error ? metaQuery.error.message : '分类信息加载失败'}
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-[var(--space-fab-offset)] z-20 lg:bottom-6">
        <div className="mx-auto flex max-w-[var(--layout-shell-max)] justify-end px-[var(--space-shell-x)] sm:px-6">
          <ComposeFab onClick={openComposeSheet} />
        </div>
      </div>

      <DiscoverComposeSheet />
      <DiscoverDetailSheet
        postId={postId}
        onClose={() =>
          patchSearchParams((params) => {
            params.delete('postId');
          })
        }
      />
    </div>
  );
}
