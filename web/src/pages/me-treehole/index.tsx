/**
 * [INPUT]: 依赖当前用户 Treehole 列表、个人图文面板、发布/详情、分享反馈与 Social 导航
 * [OUTPUT]: 对外提供 MeTreeholePage，展示并分享当前用户的树洞图文动态
 * [POS]: pages/me-treehole 的路由编排器，统一详情查询参数与 canonical 分享
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ArrowLeft, Plus } from 'lucide-react';
import { startTransition, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import { useMyTreeholeInfinitePostsQuery } from '@/entities/treehole/api/treehole-queries';
import type { TreeholePost } from '@/entities/treehole/model/treehole-types';
import { shareSocialPost } from '@/pages/social-share';
import { Button } from '@/shared/ui/button';
import { IconButton } from '@/shared/ui/icon-button';
import { PageHeader } from '@/shared/ui/page-header';
import { MyTreeholePostsPanel } from '@/widgets/my-treehole-posts-panel/my-treehole-posts-panel';
import { TreeholeComposeSheet } from '@/widgets/treehole-compose-sheet/treehole-compose-sheet';
import { TreeholeDetailSheet } from '@/widgets/treehole-detail-sheet/treehole-detail-sheet';

export function MeTreeholePage() {
  const navigate = useNavigate();
  const pushToast = useToastStore((state) => state.pushToast);
  const [searchParams, setSearchParams] = useSearchParams();
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const openComposeSheet = useUiStore((state) => state.openTreeholeComposeSheet);
  const myPostsQuery = useMyTreeholeInfinitePostsQuery({ pageSize: 12 });
  const myPosts = myPostsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const rawPostId = Number(searchParams.get('postId'));
  const postId = Number.isInteger(rawPostId) && rawPostId > 0 ? rawPostId : null;

  useEffect(() => setActiveTab('me'), [setActiveTab]);

  function patchSearchParams(patcher: (params: URLSearchParams) => void) {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams);
      patcher(nextParams);
      if (!nextParams.get('postId')) nextParams.delete('postId');
      setSearchParams(nextParams);
    });
  }

  async function handleSharePost(post: TreeholePost) {
    try {
      const result = await shareSocialPost({ path: appRoutes.treehole, postId: post.id, text: post.content, title: '树洞动态' });
      if (result === 'copied') pushToast({ title: '帖子链接已复制', variant: 'success' });
    } catch {
      pushToast({ title: '分享失败，请重试', variant: 'error' });
    }
  }

  return (
    <div className="page-stack-mobile">
      <PageHeader
        action={(
          <div className="flex items-center gap-1">
            <IconButton icon={<ArrowLeft aria-hidden="true" className="size-4" />} label="返回" size="sm" onClick={() => navigate(appRoutes.me)} />
            <Button size="sm" type="button" onClick={openComposeSheet}><Plus aria-hidden="true" className="size-4" />发布</Button>
          </div>
        )}
        compact
        title="我的树洞"
      />

      {myPostsQuery.isError ? <p className="text-sm text-error">加载失败，请重试</p> : null}

      <MyTreeholePostsPanel
        hasMore={Boolean(myPostsQuery.hasNextPage)}
        loading={myPostsQuery.isLoading}
        loadingMore={myPostsQuery.isFetchingNextPage}
        posts={myPosts}
        onLoadMore={() => void myPostsQuery.fetchNextPage()}
        onOpenPost={(nextPostId) => patchSearchParams((params) => params.set('postId', String(nextPostId)))}
      />

      <TreeholeComposeSheet />
      <TreeholeDetailSheet
        postId={postId}
        onClose={() => patchSearchParams((params) => params.delete('postId'))}
        onMessageAuthor={(userId) => navigate(`${appRoutes.messages}?userId=${userId}`)}
        onOpenProfile={(userId) => navigate(`${appRoutes.treehole}?profileUserId=${userId}`)}
        onSharePost={(post) => void handleSharePost(post)}
      />
    </div>
  );
}
