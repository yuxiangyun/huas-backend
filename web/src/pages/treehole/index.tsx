/**
 * [INPUT]: 依赖 URL 查询参数、Social 路径与发布/详情/公共作者资料弹层加载器
 * [OUTPUT]: 对外提供 TreeholePage，编排树洞信息流、发布、详情、作者资料与私信入口
 * [POS]: pages/treehole 的路由级组装器，统一弹层预加载与查询参数，不实现社区请求协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { lazy, startTransition, Suspense, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useUiStore } from '@/app/state/ui-store';
import { appRoutes } from '@/app/router/paths';
import { IconButton } from '@/shared/ui/icon-button';
import { PageHeader } from '@/shared/ui/page-header';
import { TreeholeFeed } from '@/widgets/treehole-feed/treehole-feed';

const loadTreeholeComposeSheet = () => import('@/widgets/treehole-compose-sheet/treehole-compose-sheet');
const loadTreeholeDetailSheet = () => import('@/widgets/treehole-detail-sheet/treehole-detail-sheet');
const loadPublicProfileDialog = () => import('@/widgets/public-profile-dialog/public-profile-dialog');

const LazyTreeholeComposeSheet = lazy(async () => {
  const module = await loadTreeholeComposeSheet();
  return { default: module.TreeholeComposeSheet };
});

const LazyTreeholeDetailSheet = lazy(async () => {
  const module = await loadTreeholeDetailSheet();
  return { default: module.TreeholeDetailSheet };
});

const LazyPublicProfileDialog = lazy(async () => {
  const module = await loadPublicProfileDialog();
  return { default: module.PublicProfileDialog };
});

export function TreeholePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const composeSheetOpen = useUiStore((state) => state.treeholeComposeSheetOpen);
  const openComposeSheet = useUiStore((state) => state.openTreeholeComposeSheet);
  const rawPostId = Number(searchParams.get('postId'));
  const postId = Number.isInteger(rawPostId) && rawPostId > 0 ? rawPostId : null;
  const rawProfileUserId = Number(searchParams.get('profileUserId'));
  const profileUserId = Number.isInteger(rawProfileUserId) && rawProfileUserId > 0 ? rawProfileUserId : null;
  const [composeSheetRequested, setComposeSheetRequested] = useState(false);
  const [detailSheetRequested, setDetailSheetRequested] = useState(false);
  const [publicProfileRequested, setPublicProfileRequested] = useState(false);

  useEffect(() => {
    setActiveTab('treehole');
  }, [setActiveTab]);

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
    if (profileUserId === null) return;
    setPublicProfileRequested(true);
    void loadPublicProfileDialog();
  }, [profileUserId]);

  function patchSearchParams(
    patcher: (params: URLSearchParams) => void
  ) {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams);
      patcher(nextParams);

      if (!nextParams.get('postId')) {
        nextParams.delete('postId');
      }

      if (!nextParams.get('profileUserId')) {
        nextParams.delete('profileUserId');
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

  const handleOpenPublicProfile = (userId: number) => {
    setPublicProfileRequested(true);
    void loadPublicProfileDialog();
    patchSearchParams((params) => {
      params.set('profileUserId', String(userId));
      params.delete('postId');
    });
  };

  return (
    <div className="page-stack-mobile">
      <section className="overflow-hidden rounded-[0.5rem] border border-[#dbdbdb] bg-white">
        <PageHeader
          action={(
            <IconButton
              className="-mr-2 text-ink hover:bg-[#f2f2f2]"
              icon={<Plus aria-hidden="true" className="size-7" strokeWidth={1.8} />}
              label="发布树洞"
              size="md"
              variant="ghost"
              onClick={handleOpenComposeSheet}
            />
          )}
          className="px-4 py-4 sm:px-5"
          compact
          title="树洞"
        />

        <TreeholeFeed
          onComposeClick={handleOpenComposeSheet}
          onOpenPost={handleOpenPost}
          onOpenProfile={handleOpenPublicProfile}
        />
      </section>

      {composeSheetRequested ? (
        <Suspense fallback={null}>
          <LazyTreeholeComposeSheet />
        </Suspense>
      ) : null}

      {detailSheetRequested ? (
        <Suspense fallback={null}>
          <LazyTreeholeDetailSheet
            postId={postId}
            onMessageAuthor={(userId) => navigate(`${appRoutes.messages}?userId=${userId}`)}
            onOpenProfile={handleOpenPublicProfile}
            onClose={() =>
              patchSearchParams((params) => {
                params.delete('postId');
              })
            }
          />
        </Suspense>
      ) : null}

      {publicProfileRequested ? (
        <Suspense fallback={null}>
          <LazyPublicProfileDialog
            userId={profileUserId}
            onClose={() => patchSearchParams((params) => params.delete('profileUserId'))}
            onMessage={(userId) => navigate(`${appRoutes.messages}?userId=${userId}`)}
            onOpenDiscoverPost={(nextPostId) => navigate(`${appRoutes.discover}?postId=${nextPostId}`)}
            onOpenTreeholePost={(nextPostId) => handleOpenPost(nextPostId)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
