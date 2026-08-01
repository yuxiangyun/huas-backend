/**
 * [INPUT]: 依赖 Discover HTTP adapter、查询键、共享时间策略、写后缓存策略与 TanStack Query
 * [OUTPUT]: 对外提供引用元数据、60 秒 Feed、本人/指定用户帖子、评论与写入缓存编排 hooks，筛选切换时保留上一帧列表
 * [POS]: entities/discover 的客户端缓存层，以稳定占位衔接查询键切换，局部反馈后由服务端重算排序与评论分页事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDiscoverComment,
  createDiscoverPost,
  deleteDiscoverComment,
  deleteDiscoverPost,
  getDiscoverComments,
  getDiscoverMeta,
  getDiscoverPostDetail,
  getDiscoverPosts,
  getMyDiscoverPosts,
  getUserDiscoverPosts,
  likeDiscoverPost,
  unlikeDiscoverPost,
  type CreateDiscoverPostPayload,
  type DiscoverCommentListParams,
  type DiscoverListParams,
  type DiscoverMyListParams,
} from '@/entities/discover/api/discover-api';
import {
  reconcileCreatedDiscoverComment,
  reconcileDiscoverLike,
  optimisticallyReconcileDiscoverLike,
} from '@/entities/discover/api/discover-cache-policy';
import { discoverQueryKeys } from '@/entities/discover/model/discover-query-keys';
import { QUERY_CACHE_POLICY } from '@/shared/api/query-cache-policy';

export function useDiscoverMetaQuery() {
  return useQuery({
    queryKey: discoverQueryKeys.meta(),
    queryFn: ({ signal }) => getDiscoverMeta({ signal }),
    ...QUERY_CACHE_POLICY.reference,
  });
}

export function useDiscoverPostsQuery(params: DiscoverListParams) {
  return useQuery({
    queryKey: discoverQueryKeys.list(params),
    queryFn: ({ signal }) => getDiscoverPosts(params, { signal }),
  });
}

export function useDiscoverInfinitePostsQuery(params: Omit<DiscoverListParams, 'page'>) {
  return useInfiniteQuery({
    initialPageParam: 1,
    queryKey: discoverQueryKeys.list(params),
    queryFn: ({ pageParam, signal }) =>
      getDiscoverPosts({
        ...params,
        page: pageParam,
      }, { signal }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    placeholderData: keepPreviousData,
    ...QUERY_CACHE_POLICY.standard,
  });
}

export function useMyDiscoverPostsQuery(params: DiscoverMyListParams) {
  return useQuery({
    queryKey: discoverQueryKeys.mine(params),
    queryFn: ({ signal }) => getMyDiscoverPosts(params, { signal }),
  });
}

export function useMyDiscoverInfinitePostsQuery(params: Omit<DiscoverMyListParams, 'page'>) {
  return useInfiniteQuery({
    initialPageParam: 1,
    queryKey: discoverQueryKeys.mine(params),
    queryFn: ({ pageParam, signal }) =>
      getMyDiscoverPosts({
        ...params,
        page: pageParam,
      }, { signal }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });
}

export function useUserDiscoverInfinitePostsQuery(
  userId: number | null,
  params: Omit<DiscoverMyListParams, 'page'>
) {
  return useInfiniteQuery({
    initialPageParam: 1,
    queryKey: discoverQueryKeys.userPosts(userId ?? 0, params),
    queryFn: ({ pageParam, signal }) => getUserDiscoverPosts(
      userId!,
      { ...params, page: pageParam },
      { signal }
    ),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: userId !== null,
  });
}

export function useDiscoverPostDetailQuery(postId: number | null) {
  return useQuery({
    queryKey: discoverQueryKeys.detail(postId ?? 0),
    queryFn: ({ signal }) => getDiscoverPostDetail(postId!, { signal }),
    enabled: postId !== null,
  });
}

export function useDiscoverInfiniteCommentsQuery(
  postId: number | null,
  params: Omit<DiscoverCommentListParams, 'page'>
) {
  return useInfiniteQuery({
    initialPageParam: 1,
    queryKey: discoverQueryKeys.commentList(postId ?? 0, params),
    queryFn: ({ pageParam, signal }) =>
      getDiscoverComments(postId!, {
        ...params,
        page: pageParam,
      }, { signal }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: postId !== null,
  });
}

export function useCreateDiscoverPostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateDiscoverPostPayload) => createDiscoverPost(payload),
    onSuccess: (post) => {
      queryClient.setQueryData(discoverQueryKeys.detail(post.id), post);
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.mines() });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.userPostsAll() });
    },
  });
}

function useDiscoverLikeMutation(action: 'like' | 'unlike') {
  const queryClient = useQueryClient();

  return useMutation({
    scope: { id: 'discover-like' },
    mutationFn: ({ postId }: { postId: number }) =>
      action === 'like' ? likeDiscoverPost(postId) : unlikeDiscoverPost(postId),
    onMutate: async ({ postId }) => {
      const scopes = [
        discoverQueryKeys.detail(postId),
        discoverQueryKeys.lists(),
        discoverQueryKeys.mines(),
        discoverQueryKeys.userPostsAll(),
      ] as const;
      await Promise.all(scopes.map((queryKey) => queryClient.cancelQueries({ queryKey })));
      const detail = queryClient.getQueryData<{
        likedByMe: boolean;
        likeCount: number;
      }>(discoverQueryKeys.detail(postId));
      let previous = detail
        ? { postId, liked: detail.likedByMe, likeCount: detail.likeCount }
        : null;
      if (!previous) {
        for (const [, data] of queryClient.getQueriesData<{ pages?: Array<{ items?: Array<{ id: number; likedByMe: boolean; likeCount: number }> }> }>({
          queryKey: discoverQueryKeys.lists(),
        })) {
          const post = data?.pages?.flatMap((page) => page.items ?? []).find((item) => item.id === postId);
          if (post) {
            previous = { postId, liked: post.likedByMe, likeCount: post.likeCount };
            break;
          }
        }
      }
      optimisticallyReconcileDiscoverLike(queryClient, postId, action === 'like');
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) reconcileDiscoverLike(queryClient, context.previous);
    },
    onSuccess: (result) => {
      reconcileDiscoverLike(queryClient, result);
    },
  });
}

export function useLikeDiscoverPostMutation() {
  return useDiscoverLikeMutation('like');
}

export function useUnlikeDiscoverPostMutation() {
  return useDiscoverLikeMutation('unlike');
}

export function useDeleteDiscoverPostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => deleteDiscoverPost(postId),
    onSuccess: (_, variables) => {
      queryClient.removeQueries({ queryKey: discoverQueryKeys.detail(variables.postId) });
      queryClient.removeQueries({ queryKey: discoverQueryKeys.comments(variables.postId) });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.mines() });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.userPostsAll() });
    },
  });
}

export function useCreateDiscoverCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, content, parentCommentId }: { postId: number; content: string; parentCommentId?: number | null }) =>
      createDiscoverComment(postId, { content, parentCommentId }),
    onSuccess: (comment) => {
      reconcileCreatedDiscoverComment(queryClient, comment.postId);
    },
  });
}

export function useDeleteDiscoverCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId }: { commentId: number }) => deleteDiscoverComment(commentId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.detail(result.postId) });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.comments(result.postId) });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.mines() });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.userPostsAll() });
    },
  });
}
