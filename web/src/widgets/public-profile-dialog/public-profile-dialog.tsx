/**
 * [INPUT]: 依赖 Community 公共资料、Discover/Treehole 指定用户帖子查询与上层导航动作
 * [OUTPUT]: 对外提供 PublicProfileDialog，展示用户资料、两类公开内容并进入私信或帖子详情
 * [POS]: widgets/public-profile-dialog 的跨领域只读任务容器，是作者头像、昵称与私信之间的统一入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useEffect, useState } from 'react';
import { Heart, MessageCircle, Send } from 'lucide-react';
import { useCommunityProfileQuery, useCommunityUserQuery } from '@/entities/community/api/community-queries';
import { useUserDiscoverInfinitePostsQuery } from '@/entities/discover/api/discover-queries';
import { useUserTreeholeInfinitePostsQuery } from '@/entities/treehole/api/treehole-queries';
import { buildMediaUrl } from '@/shared/api/media';
import { Button } from '@/shared/ui/button';
import { CommunityAvatar } from '@/shared/ui/community-avatar';
import { EmptyState } from '@/shared/ui/empty-state';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { TaskDialog } from '@/shared/ui/task-dialog';

type ProfileSection = 'discover' | 'treehole';

interface PublicProfileDialogProps {
  userId: number | null;
  onClose: () => void;
  onMessage: (userId: number) => void;
  onOpenDiscoverPost: (postId: number) => void;
  onOpenTreeholePost: (postId: number) => void;
}

function formatPublishedAt(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function PublicProfileDialog({
  userId,
  onClose,
  onMessage,
  onOpenDiscoverPost,
  onOpenTreeholePost,
}: PublicProfileDialogProps) {
  const [section, setSection] = useState<ProfileSection>('discover');
  const profileQuery = useCommunityUserQuery(userId);
  const currentProfileQuery = useCommunityProfileQuery({ enabled: userId !== null });
  const discoverQuery = useUserDiscoverInfinitePostsQuery(userId, { pageSize: 20 });
  const treeholeQuery = useUserTreeholeInfinitePostsQuery(userId, { pageSize: 20 });
  const discoverPosts = discoverQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const treeholePosts = treeholeQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const profile = profileQuery.data;
  const isMine = profile?.id === currentProfileQuery.data?.id;

  useEffect(() => setSection('discover'), [userId]);

  const openDiscoverPost = (postId: number) => {
    onClose();
    onOpenDiscoverPost(postId);
  };

  const openTreeholePost = (postId: number) => {
    onClose();
    onOpenTreeholePost(postId);
  };

  return (
    <TaskDialog
      contentClassName="p-0 sm:p-0"
      open={userId !== null}
      title="用户资料"
      onClose={onClose}
    >
      <div className="min-h-full bg-shell">
        <section className="flex items-center gap-4 border-b border-line bg-white px-4 py-5 sm:px-5">
          {profileQuery.isLoading ? (
            <>
              <div className="size-14 animate-pulse rounded-full bg-shell-strong" />
              <div className="flex-1 space-y-2"><div className="h-5 w-28 animate-pulse rounded bg-shell-strong" /><div className="h-4 w-20 animate-pulse rounded bg-shell-strong" /></div>
            </>
          ) : profileQuery.isError || !profile ? (
            <EmptyState title="用户资料加载失败" />
          ) : (
            <>
              <CommunityAvatar alt={`${profile.displayName}的头像`} className="size-14" src={profile.avatarUrl} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold">{profile.displayName}</h2>
                <p className="mt-1 text-xs text-muted">用户 #{profile.id}</p>
              </div>
              {currentProfileQuery.isSuccess && !isMine ? (
                <Button size="sm" type="button" onClick={() => onMessage(profile.id)}>
                  <Send aria-hidden="true" className="size-4" />
                  私信
                </Button>
              ) : null}
            </>
          )}
        </section>

        <div className="space-y-3 px-4 py-4 sm:px-5">
          <SegmentedControl
            items={[
              { value: 'discover', label: `好饭 ${discoverQuery.data?.pages[0]?.total ?? 0}` },
              { value: 'treehole', label: `树洞 ${treeholeQuery.data?.pages[0]?.total ?? 0}` },
            ]}
            value={section}
            onChange={setSection}
          />

          <div className="overflow-hidden rounded-[0.75rem] border border-line bg-white">
            {section === 'discover' ? (
              discoverQuery.isLoading ? (
                <div className="h-44 animate-pulse bg-shell-strong" aria-hidden="true" />
              ) : discoverQuery.isError ? (
                <EmptyState title="好饭加载失败" />
              ) : discoverPosts.length === 0 ? (
                <EmptyState title="暂无好饭" />
              ) : (
                <div className="divide-y divide-line">
                  {discoverPosts.map((post) => (
                    <button key={post.id} className="flex w-full gap-3 px-3.5 py-3 text-left hover:bg-tint-soft" type="button" onClick={() => openDiscoverPost(post.id)}>
                      {post.coverUrl ? <img alt="" className="size-16 shrink-0 rounded-[0.5rem] object-cover" src={buildMediaUrl(post.coverUrl)} /> : null}
                      <span className="min-w-0 flex-1">
                        <strong className="text-clamp-1 block text-sm font-semibold">{post.title}</strong>
                        <span className="text-clamp-2 mt-1 block text-sm leading-5 text-muted">{post.content}</span>
                        <span className="mt-2 flex items-center gap-3 text-xs text-muted">
                          <span>{formatPublishedAt(post.publishedAt)}</span>
                          <span className="inline-flex items-center gap-1"><Heart aria-hidden="true" className="size-3.5" />{post.likeCount}</span>
                          <span className="inline-flex items-center gap-1"><MessageCircle aria-hidden="true" className="size-3.5" />{post.commentCount}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                  {discoverQuery.hasNextPage ? (
                    <div className="flex justify-center px-4 py-3"><Button disabled={discoverQuery.isFetchingNextPage} size="sm" variant="ghost" onClick={() => void discoverQuery.fetchNextPage()}>{discoverQuery.isFetchingNextPage ? '加载中…' : '更多好饭'}</Button></div>
                  ) : null}
                </div>
              )
            ) : treeholeQuery.isLoading ? (
              <div className="h-44 animate-pulse bg-shell-strong" aria-hidden="true" />
            ) : treeholeQuery.isError ? (
              <EmptyState title="树洞加载失败" />
            ) : treeholePosts.length === 0 ? (
              <EmptyState title="暂无树洞" />
            ) : (
              <div className="divide-y divide-line">
                {treeholePosts.map((post) => (
                  <button key={post.id} className="block w-full px-4 py-3.5 text-left hover:bg-tint-soft" type="button" onClick={() => openTreeholePost(post.id)}>
                    <span className="text-clamp-3 block break-words text-sm leading-6">{post.content}</span>
                    <span className="mt-2 flex items-center gap-3 text-xs text-muted">
                      <span>{formatPublishedAt(post.publishedAt)}</span>
                      <span className="inline-flex items-center gap-1"><Heart aria-hidden="true" className="size-3.5" />{post.stats.likeCount}</span>
                      <span className="inline-flex items-center gap-1"><MessageCircle aria-hidden="true" className="size-3.5" />{post.stats.commentCount}</span>
                    </span>
                  </button>
                ))}
                {treeholeQuery.hasNextPage ? (
                  <div className="flex justify-center px-4 py-3"><Button disabled={treeholeQuery.isFetchingNextPage} size="sm" variant="ghost" onClick={() => void treeholeQuery.fetchNextPage()}>{treeholeQuery.isFetchingNextPage ? '加载中…' : '更多树洞'}</Button></div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </TaskDialog>
  );
}
