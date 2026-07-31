/**
 * [INPUT]: 依赖 TanStack QueryClient、Discover 查询键与帖子/点赞响应契约
 * [OUTPUT]: 对外提供点赞和评论创建后的 Discover 缓存协调纯策略
 * [POS]: entities/discover/api 的写后读模型规则，局部反馈不取代服务端排序与分页事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { discoverQueryKeys } from '@/entities/discover/model/discover-query-keys';
import type { DiscoverLikeResult, DiscoverPost } from '@/entities/discover/model/discover-types';

type DiscoverCacheClient = Pick<
  QueryClient,
  'invalidateQueries' | 'setQueriesData' | 'setQueryData'
>;

function applyLikeResult(post: DiscoverPost | undefined, result: DiscoverLikeResult) {
  return post ? { ...post, likedByMe: result.liked, likeCount: result.likeCount } : post;
}

function patchLikeInListCache(oldData: unknown, result: DiscoverLikeResult) {
  if (!oldData || typeof oldData !== 'object' || !('pages' in oldData)) return oldData;
  const typed = oldData as InfiniteData<{ items: DiscoverPost[] }>;
  return {
    ...typed,
    pages: typed.pages.map((page) => ({
      ...page,
      items: page.items.map((post) => post.id === result.postId ? applyLikeResult(post, result)! : post),
    })),
  };
}

export function reconcileDiscoverLike(
  queryClient: DiscoverCacheClient,
  result: DiscoverLikeResult,
) {
  queryClient.setQueryData<DiscoverPost>(
    discoverQueryKeys.detail(result.postId),
    (post) => applyLikeResult(post, result),
  );
  queryClient.setQueriesData(
    { queryKey: discoverQueryKeys.lists() },
    (oldData) => patchLikeInListCache(oldData, result),
  );
  queryClient.setQueriesData(
    { queryKey: discoverQueryKeys.mines() },
    (oldData) => patchLikeInListCache(oldData, result),
  );
  queryClient.setQueriesData(
    { queryKey: discoverQueryKeys.userPostsAll() },
    (oldData) => patchLikeInListCache(oldData, result),
  );
  queryClient.invalidateQueries({ queryKey: discoverQueryKeys.lists() });
}

export function reconcileCreatedDiscoverComment(
  queryClient: DiscoverCacheClient,
  postId: number,
) {
  queryClient.invalidateQueries({ queryKey: discoverQueryKeys.comments(postId) });
  queryClient.invalidateQueries({ queryKey: discoverQueryKeys.detail(postId) });
  queryClient.invalidateQueries({ queryKey: discoverQueryKeys.lists() });
  queryClient.invalidateQueries({ queryKey: discoverQueryKeys.mines() });
  queryClient.invalidateQueries({ queryKey: discoverQueryKeys.userPostsAll() });
}
