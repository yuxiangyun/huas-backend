/**
 * [INPUT]: 依赖 Treehole 提醒写入、URL 查询参数与发布/详情/社区资料弹层加载器
 * [OUTPUT]: 对外提供 TreeholePage，编排树洞信息流、发布、编辑资料与详情路由状态
 * [POS]: pages/treehole 的路由级组装器，统一弹层预加载与查询参数，不实现社区请求协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { lazy, startTransition, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, UserPen } from 'lucide-react';
import { useUiStore } from '@/app/state/ui-store';
import { useReadAllTreeholeNotificationsMutation } from '@/entities/treehole/api/treehole-queries';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { TreeholeFeed } from '@/widgets/treehole-feed/treehole-feed';

const loadTreeholeComposeSheet = () => import('@/widgets/treehole-compose-sheet/treehole-compose-sheet');
const loadTreeholeDetailSheet = () => import('@/widgets/treehole-detail-sheet/treehole-detail-sheet');
const loadTreeholeAvatarSheet = () => import('@/widgets/treehole-avatar-sheet/treehole-avatar-sheet');

const TREEHOLE_WORDMARK = (
  <span
    className="relative inline-flex items-center pr-4"
    style={{ fontFamily: '"Songti SC", "STSong", "Noto Serif CJK SC", serif' }}
  >
    <span className="text-[#15803d]">树</span>
    <span className="-ml-[0.08em] text-[#22c55e]">洞</span>
    <span
      aria-hidden="true"
      className="absolute right-0 top-0 h-3.5 w-2.5 rotate-[35deg] rounded-[100%_0_100%_0] bg-[#4ade80]"
    />
  </span>
);

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
          <div className="flex items-center gap-2">
            <Button size="sm" type="button" onClick={handleOpenComposeSheet}>
              <Plus aria-hidden="true" className="size-4" />
              发布
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={handleOpenAvatarSheet}>
              <UserPen aria-hidden="true" className="size-4" />
              编辑资料
            </Button>
          </div>
        )}
        compact
        title={TREEHOLE_WORDMARK}
        titleClassName="text-[2rem] font-black leading-none tracking-[-0.08em]"
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
