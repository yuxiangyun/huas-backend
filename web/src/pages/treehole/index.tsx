import { lazy, startTransition, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Add20Filled } from '@fluentui/react-icons/svg/add';
import { Chat24Filled } from '@fluentui/react-icons/svg/chat';
import { Comment20Filled } from '@fluentui/react-icons/svg/comment';
import { TextQuote20Filled } from '@fluentui/react-icons/svg/text-quote';
import { useUiStore } from '@/app/state/ui-store';
import { useReadAllTreeholeNotificationsMutation } from '@/entities/treehole/api/treehole-queries';
import { PageHeader } from '@/shared/ui/page-header';
import { Button } from '@/shared/ui/button';
import { PageOrnament } from '@/shared/ui/page-ornament';
import { TreeholeFeed } from '@/widgets/treehole-feed/treehole-feed';

const loadTreeholeComposeSheet = () => import('@/widgets/treehole-compose-sheet/treehole-compose-sheet');
const loadTreeholeDetailSheet = () => import('@/widgets/treehole-detail-sheet/treehole-detail-sheet');

const LazyTreeholeComposeSheet = lazy(async () => {
  const module = await loadTreeholeComposeSheet();
  return { default: module.TreeholeComposeSheet };
});

const LazyTreeholeDetailSheet = lazy(async () => {
  const module = await loadTreeholeDetailSheet();
  return { default: module.TreeholeDetailSheet };
});

export function TreeholePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const composeSheetOpen = useUiStore((state) => state.treeholeComposeSheetOpen);
  const openComposeSheet = useUiStore((state) => state.openTreeholeComposeSheet);
  const readAllNotificationsMutation = useReadAllTreeholeNotificationsMutation();
  const notificationsReadTriggeredRef = useRef(false);
  const rawPostId = Number(searchParams.get('postId'));
  const postId = Number.isInteger(rawPostId) && rawPostId > 0 ? rawPostId : null;
  const [composeSheetRequested, setComposeSheetRequested] = useState(false);
  const [detailSheetRequested, setDetailSheetRequested] = useState(false);

  useEffect(() => {
    setActiveTab('treehole');
  }, [setActiveTab]);

  useEffect(() => {
    if (notificationsReadTriggeredRef.current) return;
    notificationsReadTriggeredRef.current = true;
    readAllNotificationsMutation.mutate();
  }, [readAllNotificationsMutation]);

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
          <Button className="min-w-[4.5rem]" size="sm" type="button" variant="subtle" onClick={handleOpenComposeSheet}>
            <Add20Filled aria-hidden="true" className="size-4" />
            发一条
          </Button>
        )}
        compact
        description="匿名发言"
        eyebrow="树洞"
        title="树洞"
        visual={(
          <PageOrnament
            badges={[
              {
                icon: <TextQuote20Filled aria-hidden="true" className="size-3.5" />,
                label: '匿名',
                tone: 'rose',
              },
            ]}
            className="w-full sm:w-[13rem]"
            compact
            icon={<Chat24Filled aria-hidden="true" className="size-6" />}
            label="匿名树洞"
            title="发声，也留一点回响"
            tone="blue"
          />
        )}
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
    </div>
  );
}
