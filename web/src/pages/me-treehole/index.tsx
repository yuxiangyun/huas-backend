import { startTransition, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft20Filled } from '@fluentui/react-icons/svg/arrow-left';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import {
  useMyTreeholeInfinitePostsQuery,
  useReadAllTreeholeNotificationsMutation,
} from '@/entities/treehole/api/treehole-queries';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/page-header';
import { MyTreeholePostsPanel } from '@/widgets/my-treehole-posts-panel/my-treehole-posts-panel';
import { TreeholeAvatarSheet } from '@/widgets/treehole-avatar-sheet/treehole-avatar-sheet';
import { TreeholeComposeSheet } from '@/widgets/treehole-compose-sheet/treehole-compose-sheet';
import { TreeholeDetailSheet } from '@/widgets/treehole-detail-sheet/treehole-detail-sheet';

export function MeTreeholePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const openComposeSheet = useUiStore((state) => state.openTreeholeComposeSheet);
  const openAvatarSheet = useUiStore((state) => state.openTreeholeAvatarSheet);
  const pushToast = useToastStore((state) => state.pushToast);
  const readAllNotificationsMutation = useReadAllTreeholeNotificationsMutation();
  const notificationsReadTriggeredRef = useRef(false);
  const myPostsQuery = useMyTreeholeInfinitePostsQuery({ pageSize: 12 });
  const myPosts = myPostsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const totalPosts = myPostsQuery.data?.pages[0]?.total ?? myPosts.length;
  const rawPostId = Number(searchParams.get('postId'));
  const postId = Number.isInteger(rawPostId) && rawPostId > 0 ? rawPostId : null;

  let totalLikes = 0;
  let totalComments = 0;
  for (const post of myPosts) {
    totalLikes += post.stats.likeCount;
    totalComments += post.stats.commentCount;
  }

  useEffect(() => {
    setActiveTab('me');
  }, [setActiveTab]);

  useEffect(() => {
    if (notificationsReadTriggeredRef.current) return;
    notificationsReadTriggeredRef.current = true;
    readAllNotificationsMutation.mutate(undefined, {
      onError: (error) => {
        pushToast({
          title: error instanceof Error ? error.message : '提醒已读同步失败',
          variant: 'error',
        });
      },
    });
  }, [pushToast, readAllNotificationsMutation]);

  function patchSearchParams(
    patcher: (params: URLSearchParams) => void
  ) {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams);
      patcher(nextParams);

      if (!nextParams.get('postId')) {
        nextParams.delete('postId');
      }

      setSearchParams(nextParams);
    });
  }

  return (
    <div className="page-stack-mobile">
      <PageHeader
        action={(
          <div className="flex items-center gap-1.5">
            <Button className="px-2.5" size="sm" type="button" variant="ghost" onClick={() => navigate(appRoutes.me)}>
              <ArrowLeft20Filled aria-hidden="true" className="size-4" />
              返回
            </Button>
            <Button className="min-w-[4.25rem]" size="sm" type="button" variant="subtle" onClick={openAvatarSheet}>
              头像
            </Button>
            <Button className="min-w-[4.25rem]" size="sm" type="button" variant="secondary" onClick={openComposeSheet}>
              发一条
            </Button>
          </div>
        )}
        compact
        eyebrow="树洞"
        title="我的树洞"
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
            <p className="text-xs uppercase tracking-[0.18em] text-muted">收到的赞</p>
            <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-ink">{totalLikes}</p>
            <p className="mt-1.5 text-[0.82rem] leading-5 text-muted">已加载</p>
          </div>
          <div className="col-span-2 rounded-[1.1rem] bg-white/78 px-3.5 py-3 ring-1 ring-line sm:col-span-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">收到的评论</p>
            <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-ink">{totalComments}</p>
            <p className="mt-1.5 text-[0.82rem] leading-5 text-muted">已加载</p>
          </div>
        </div>
      </Card>

      {myPostsQuery.isError ? (
        <Card className="space-y-2">
          <p className="text-base font-semibold text-ink">我的树洞加载失败</p>
          <p className="text-sm leading-6 text-muted">
            {myPostsQuery.error instanceof Error ? myPostsQuery.error.message : '请求失败'}
          </p>
        </Card>
      ) : null}

      <MyTreeholePostsPanel
        hasMore={Boolean(myPostsQuery.hasNextPage)}
        loading={myPostsQuery.isLoading}
        loadingMore={myPostsQuery.isFetchingNextPage}
        posts={myPosts}
        totalCount={totalPosts}
        refreshing={myPostsQuery.isRefetching}
        onLoadMore={() => void myPostsQuery.fetchNextPage()}
        onOpenPost={(nextPostId) =>
          patchSearchParams((params) => {
            params.set('postId', String(nextPostId));
          })
        }
        onRefresh={() => void myPostsQuery.refetch()}
      />

      <TreeholeComposeSheet />
      <TreeholeAvatarSheet />
      <TreeholeDetailSheet
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
