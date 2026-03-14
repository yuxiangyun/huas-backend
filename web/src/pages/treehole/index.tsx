import { lazy, startTransition, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Add20Filled } from '@fluentui/react-icons/svg/add';
import { useUiStore } from '@/app/state/ui-store';
import { useToastStore } from '@/app/state/toast-store';
import { useReadAllTreeholeNotificationsMutation } from '@/entities/treehole/api/treehole-queries';
import { PageHeader } from '@/shared/ui/page-header';
import { Button } from '@/shared/ui/button';
import { TreeholeFeed } from '@/widgets/treehole-feed/treehole-feed';

const loadTreeholeComposeSheet = () => import('@/widgets/treehole-compose-sheet/treehole-compose-sheet');
const loadTreeholeDetailSheet = () => import('@/widgets/treehole-detail-sheet/treehole-detail-sheet');
const loadTreeholeAvatarSheet = () => import('@/widgets/treehole-avatar-sheet/treehole-avatar-sheet');

const LazyTreeholeComposeSheet = lazy(async () => {
  const module = await loadTreeholeComposeSheet();
  return { default: module.TreeholeComposeSheet };
});

const LazyTreeholeDetailSheet = lazy(async () => {
  const module = await loadTreeholeDetailSheet();
  return { default: module.TreeholeDetailSheet };
});

const LazyTreeholeAvatarSheet = lazy(async () => {
  const module = await loadTreeholeAvatarSheet();
  return { default: module.TreeholeAvatarSheet };
});

export function TreeholePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const composeSheetOpen = useUiStore((state) => state.treeholeComposeSheetOpen);
  const avatarSheetOpen = useUiStore((state) => state.treeholeAvatarSheetOpen);
  const openComposeSheet = useUiStore((state) => state.openTreeholeComposeSheet);
  const openAvatarSheet = useUiStore((state) => state.openTreeholeAvatarSheet);
  const pushToast = useToastStore((state) => state.pushToast);
  const readAllNotificationsMutation = useReadAllTreeholeNotificationsMutation();
  const notificationsReadTriggeredRef = useRef(false);
  const rawPostId = Number(searchParams.get('postId'));
  const postId = Number.isInteger(rawPostId) && rawPostId > 0 ? rawPostId : null;
  const [composeSheetRequested, setComposeSheetRequested] = useState(false);
  const [detailSheetRequested, setDetailSheetRequested] = useState(false);
  const [avatarSheetRequested, setAvatarSheetRequested] = useState(false);

  useEffect(() => {
    setActiveTab('treehole');
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

  useEffect(() => {
    if (!composeSheetOpen) return;
    setComposeSheetRequested(true);
    void loadTreeholeComposeSheet();
  }, [composeSheetOpen]);

  useEffect(() => {
    if (postId === null) return;
    setDetailSheetRequested(true);
    void loadTreeholeDetailSheet();
  }, [postId]);

  useEffect(() => {
    if (!avatarSheetOpen) return;
    setAvatarSheetRequested(true);
    void loadTreeholeAvatarSheet();
  }, [avatarSheetOpen]);

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

  const handleOpenComposeSheet = () => {
    setComposeSheetRequested(true);
    void loadTreeholeComposeSheet();
    openComposeSheet();
  };

  const handleOpenAvatarSheet = () => {
    setAvatarSheetRequested(true);
    void loadTreeholeAvatarSheet();
    openAvatarSheet();
  };

  const handleOpenPost = (nextPostId: number) => {
    setDetailSheetRequested(true);
    void loadTreeholeDetailSheet();
    patchSearchParams((params) => {
      params.set('postId', String(nextPostId));
    });
  };

  return (
    <div className="page-stack-mobile">
      <PageHeader
        action={(
          <div className="flex items-center gap-1.5">
            <Button className="min-w-[4.25rem]" size="sm" type="button" variant="subtle" onClick={handleOpenAvatarSheet}>
              头像
            </Button>
            <Button className="min-w-[4.5rem]" size="sm" type="button" variant="subtle" onClick={handleOpenComposeSheet}>
              <Add20Filled aria-hidden="true" className="size-4" />
              发一条
            </Button>
          </div>
        )}
        compact
        description="匿名发言"
        title="树洞"
      />

      <TreeholeFeed
        onComposeClick={handleOpenComposeSheet}
        onOpenPost={handleOpenPost}
      />

      {composeSheetRequested ? (
        <Suspense fallback={null}>
          <LazyTreeholeComposeSheet />
        </Suspense>
      ) : null}

      {detailSheetRequested ? (
        <Suspense fallback={null}>
          <LazyTreeholeDetailSheet
            postId={postId}
            onClose={() =>
              patchSearchParams((params) => {
                params.delete('postId');
              })
            }
          />
        </Suspense>
      ) : null}

      {avatarSheetRequested ? (
        <Suspense fallback={null}>
          <LazyTreeholeAvatarSheet />
        </Suspense>
      ) : null}
    </div>
  );
}
