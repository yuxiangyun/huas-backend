/**
 * [INPUT]: 依赖 Discover HTTP adapter、查询键与 TanStack Query
 * [OUTPUT]: 对外提供公开/本人/指定用户帖子、评论与写入缓存编排 hooks
 * [POS]: entities/discover 的客户端缓存层，保持详情和三类列表同构更新
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
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
import { discoverQueryKeys } from '@/entities/discover/model/discover-query-keys';
import type {
  DiscoverComment,
  DiscoverCommentListResponse,
  DiscoverPost,
} from '@/entities/discover/model/discover-types';

export function useDiscoverMetaQuery() {
  return useQuery({
    queryKey: discoverQueryKeys.meta(),
    queryFn: ({ signal }) => getDiscoverMeta({ signal }),
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

function appendCommentInListCache(oldData: unknown, comment: DiscoverComment) {
  if (
    !oldData
    || typeof oldData !== 'object'
    || !('pages' in oldData)
    || !Array.isArray((oldData as InfiniteData<DiscoverCommentListResponse>).pages)
  ) {
    return oldData;
  }

  const typed = oldData as InfiniteData<DiscoverCommentListResponse>;
  if (typed.pages.length === 0) return oldData;

  const exists = typed.pages.some((page) => page.items.some((item) => item.id === comment.id));
  if (exists) return oldData;

  const lastPageIndex = typed.pages.length - 1;
  return {
    ...typed,
    pages: typed.pages.map((page, index) => {
      const nextTotal = page.total + 1;
      return {
        ...page,
        items: index === lastPageIndex ? [...page.items, comment] : page.items,
        total: nextTotal,
        hasMore: page.page * page.pageSize < nextTotal,
      };
    }),
  };
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

function applyLikeResult(post: DiscoverPost | undefined, result: { liked: boolean; likeCount: number }) {
  return post ? { ...post, likedByMe: result.liked, likeCount: result.likeCount } : post;
}

function patchLikeInListCache(oldData: unknown, postId: number, result: { liked: boolean; likeCount: number }) {
  if (!oldData || typeof oldData !== 'object' || !('pages' in oldData)) return oldData;
  const typed = oldData as InfiniteData<{ items: DiscoverPost[] }>;
  return {
    ...typed,
    pages: typed.pages.map((page) => ({
      ...page,
      items: page.items.map((post) => post.id === postId ? applyLikeResult(post, result)! : post),
    })),
  };
}

function useDiscoverLikeMutation(action: 'like' | 'unlike') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId }: { postId: number }) =>
      action === 'like' ? likeDiscoverPost(postId) : unlikeDiscoverPost(postId),
    onSuccess: (result) => {
      queryClient.setQueryData<DiscoverPost>(discoverQueryKeys.detail(result.postId), (post) => applyLikeResult(post, result));
      queryClient.setQueriesData({ queryKey: discoverQueryKeys.lists() }, (oldData) =>
        patchLikeInListCache(oldData, result.postId, result)
      );
      queryClient.setQueriesData({ queryKey: discoverQueryKeys.mines() }, (oldData) =>
        patchLikeInListCache(oldData, result.postId, result)
      );
      queryClient.setQueriesData({ queryKey: discoverQueryKeys.userPostsAll() }, (oldData) =>
        patchLikeInListCache(oldData, result.postId, result)
      );
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
      queryClient.setQueriesData(
        { queryKey: discoverQueryKeys.comments(comment.postId) },
        (oldData) => appendCommentInListCache(oldData, comment)
      );
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.detail(comment.postId) });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.mines() });
      queryClient.invalidateQueries({ queryKey: discoverQueryKeys.userPostsAll() });
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
