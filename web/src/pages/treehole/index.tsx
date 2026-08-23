/**
 * [INPUT]: 依赖 URL 查询参数、Social 路径、分享反馈与发布/详情/公共作者资料弹层加载器
 * [OUTPUT]: 对外提供 TreeholePage，以统一顶栏和黑色正圆白色加号发布入口编排双形态信息流、图文发布、详情、作者资料、私信与分享
 * [POS]: pages/treehole 的路由级组装器，原子维护帖子详情/公共资料互斥、canonical 分享与弹层预加载
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { lazy, startTransition, Suspense, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useUiStore } from '@/app/state/ui-store';
import { useToastStore } from '@/app/state/toast-store';
import { appRoutes } from '@/app/router/paths';
import type { TreeholePost } from '@/entities/treehole/model/treehole-types';
import { IconButton } from '@/shared/ui/icon-button';
import { PageHeader } from '@/shared/ui/page-header';
import { SocialPageTitle } from '@/shared/ui/social-page-title';
import { LazyTaskFallback } from '@/shared/ui/lazy-task-fallback';
import { selectSocialPost } from '@/pages/social-route-state';
import { shareSocialPost } from '@/pages/social-share';
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
  const pushToast = useToastStore((state) => state.pushToast);
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
      selectSocialPost(params, nextPostId);
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

  const handleSharePost = async (post: TreeholePost) => {
    try {
      const result = await shareSocialPost({
        path: appRoutes.treehole,
        postId: post.id,
        text: post.content,
        title: '树洞动态',
      });
      if (result === 'copied') pushToast({ title: '帖子链接已复制', variant: 'success' });
    } catch {
      pushToast({ title: '分享失败，请重试', variant: 'error' });
    }
  };

  return (
    <div className="page-stack-mobile -mx-4 bg-white sm:mx-0">
      <section className="overflow-hidden border-b border-[#dbdbdb] bg-white sm:rounded-[0.5rem] sm:border-x">
        <PageHeader
          action={(
            <IconButton
              className="-mr-1 rounded-full"
              icon={<Plus aria-hidden="true" className="size-7" strokeWidth={2.2} />}
              label="发布树洞"
              size="md"
              variant="primary"
              onClick={handleOpenComposeSheet}
            />
          )}
          className="px-4 pb-0 pt-0 sm:px-5 sm:pb-0 sm:pt-0"
          compact
          title={<SocialPageTitle variant="brand">树洞</SocialPageTitle>}
        />
        <TreeholeFeed
          onComposeClick={handleOpenComposeSheet}
          onOpenPost={handleOpenPost}
          onOpenProfile={handleOpenPublicProfile}
          onSharePost={(post) => void handleSharePost(post)}
        />
      </section>

      {composeSheetRequested ? (
        <Suspense fallback={composeSheetOpen ? <LazyTaskFallback label="发布动态" /> : null}>
          <LazyTreeholeComposeSheet />
        </Suspense>
      ) : null}

      {detailSheetRequested ? (
        <Suspense fallback={postId !== null ? <LazyTaskFallback label="树洞详情" /> : null}>
          <LazyTreeholeDetailSheet
            postId={postId}
            onMessageAuthor={(userId) => navigate(`${appRoutes.messages}?userId=${userId}`)}
            onOpenProfile={handleOpenPublicProfile}
            onSharePost={(post) => void handleSharePost(post)}
            onClose={() =>
              patchSearchParams((params) => {
                params.delete('postId');
              })
            }
          />
        </Suspense>
      ) : null}

      {publicProfileRequested ? (
        <Suspense fallback={profileUserId !== null ? <LazyTaskFallback label="用户资料" /> : null}>
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
