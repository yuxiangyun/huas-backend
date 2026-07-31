/**
 * [INPUT]: 依赖 Treehole HTTP adapter、查询键与 TanStack Query
 * [OUTPUT]: 对外提供公开/本人/指定用户帖子、评论与写入缓存编排 hooks
 * [POS]: entities/treehole 的客户端缓存层，保持详情和三类列表同构更新
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import {
  createTreeholeComment,
  createTreeholePost,
  deleteTreeholeComment,
  deleteTreeholePost,
  getMyTreeholePosts,
  getTreeholeComments,
  getTreeholeMeta,
  getTreeholePostDetail,
  getTreeholePosts,
  getUserTreeholePosts,
  likeTreeholePost,
  unlikeTreeholePost,
  type TreeholeCommentListParams,
  type TreeholeListParams,
} from '@/entities/treehole/api/treehole-api';
import { treeholeQueryKeys } from '@/entities/treehole/model/treehole-query-keys';
import type { TreeholePost } from '@/entities/treehole/model/treehole-types';

export function useTreeholeMetaQuery() {
  return useQuery({
    queryKey: treeholeQueryKeys.meta(),
    queryFn: ({ signal }) => getTreeholeMeta({ signal }),
  });
}

export function useTreeholeInfinitePostsQuery(params: Omit<TreeholeListParams, 'page'>) {
  return useInfiniteQuery({
    initialPageParam: 1,
    queryKey: treeholeQueryKeys.list(params),
    queryFn: ({ pageParam, signal }) =>
      getTreeholePosts({
        ...params,
        page: pageParam,
      }, { signal }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });
}

export function useMyTreeholeInfinitePostsQuery(params: Omit<TreeholeListParams, 'page'>) {
  return useInfiniteQuery({
    initialPageParam: 1,
    queryKey: treeholeQueryKeys.mine(params),
    queryFn: ({ pageParam, signal }) =>
      getMyTreeholePosts({
        ...params,
        page: pageParam,
      }, { signal }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });
}

export function useUserTreeholeInfinitePostsQuery(
  userId: number | null,
  params: Omit<TreeholeListParams, 'page'>
) {
  return useInfiniteQuery({
    initialPageParam: 1,
    queryKey: treeholeQueryKeys.userPosts(userId ?? 0, params),
    queryFn: ({ pageParam, signal }) => getUserTreeholePosts(
      userId!,
      { ...params, page: pageParam },
      { signal }
    ),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: userId !== null,
  });
}

export function useTreeholePostDetailQuery(postId: number | null) {
  return useQuery({
    queryKey: treeholeQueryKeys.detail(postId ?? 0),
    queryFn: ({ signal }) => getTreeholePostDetail(postId!, { signal }),
    enabled: postId !== null,
  });
}

export function useTreeholeInfiniteCommentsQuery(
  postId: number | null,
  params: Omit<TreeholeCommentListParams, 'page'>
) {
  return useInfiniteQuery({
    initialPageParam: 1,
    queryKey: treeholeQueryKeys.commentList(postId ?? 0, params),
    queryFn: ({ pageParam, signal }) =>
      getTreeholeComments(postId!, {
        ...params,
        page: pageParam,
      }, { signal }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: postId !== null,
  });
}

function replacePostInListCache(oldData: unknown, post: TreeholePost) {
  if (!oldData || typeof oldData !== 'object' || !('pages' in oldData)) {
    return oldData;
  }

  const typed = oldData as InfiniteData<{ items: TreeholePost[] }>;
  return {
    ...typed,
    pages: typed.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === post.id ? post : item)),
    })),
  };
}

function applyLikeResult(post: TreeholePost | undefined, result: { liked: boolean; likeCount: number }) {
  if (!post) return post;
  return {
    ...post,
    stats: { ...post.stats, likeCount: result.likeCount },
    viewer: { ...post.viewer, liked: result.liked },
  };
}

function patchLikeInListCache(oldData: unknown, postId: number, result: { liked: boolean; likeCount: number }) {
  if (!oldData || typeof oldData !== 'object' || !('pages' in oldData)) return oldData;
  const typed = oldData as InfiniteData<{ items: TreeholePost[] }>;
  return {
    ...typed,
    pages: typed.pages.map((page) => ({
      ...page,
      items: page.items.map((post) => post.id === postId ? applyLikeResult(post, result)! : post),
    })),
  };
}

export function useCreateTreeholePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { content: string }) => createTreeholePost(payload),
    onSuccess: (post) => {
      queryClient.setQueryData(treeholeQueryKeys.detail(post.id), post);
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.mines() });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.userPostsAll() });
    },
  });
}

export function useLikeTreeholePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => likeTreeholePost(postId),
    onSuccess: (result) => {
      queryClient.setQueryData<TreeholePost>(treeholeQueryKeys.detail(result.postId), (post) => applyLikeResult(post, result));
      queryClient.setQueriesData({ queryKey: treeholeQueryKeys.lists() }, (oldData) =>
        patchLikeInListCache(oldData, result.postId, result)
      );
      queryClient.setQueriesData({ queryKey: treeholeQueryKeys.mines() }, (oldData) =>
        patchLikeInListCache(oldData, result.postId, result)
      );
      queryClient.setQueriesData({ queryKey: treeholeQueryKeys.userPostsAll() }, (oldData) =>
        patchLikeInListCache(oldData, result.postId, result)
      );
    },
  });
}

export function useUnlikeTreeholePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => unlikeTreeholePost(postId),
    onSuccess: (result) => {
      queryClient.setQueryData<TreeholePost>(treeholeQueryKeys.detail(result.postId), (post) => applyLikeResult(post, result));
      queryClient.setQueriesData({ queryKey: treeholeQueryKeys.lists() }, (oldData) =>
        patchLikeInListCache(oldData, result.postId, result)
      );
      queryClient.setQueriesData({ queryKey: treeholeQueryKeys.mines() }, (oldData) =>
        patchLikeInListCache(oldData, result.postId, result)
      );
      queryClient.setQueriesData({ queryKey: treeholeQueryKeys.userPostsAll() }, (oldData) =>
        patchLikeInListCache(oldData, result.postId, result)
      );
    },
  });
}

export function useCreateTreeholeCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, content, parentCommentId }: { postId: number; content: string; parentCommentId?: number | null }) =>
      createTreeholeComment(postId, { content, parentCommentId }),
    onSuccess: (comment) => {
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.detail(comment.postId) });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.comments(comment.postId) });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.mines() });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.userPostsAll() });
    },
  });
}

export function useDeleteTreeholeCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId }: { commentId: number }) => deleteTreeholeComment(commentId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.detail(result.postId) });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.comments(result.postId) });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.mines() });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.userPostsAll() });
    },
  });
}

export function useDeleteTreeholePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => deleteTreeholePost(postId),
    onSuccess: (_, variables) => {
      queryClient.removeQueries({ queryKey: treeholeQueryKeys.detail(variables.postId) });
      queryClient.removeQueries({ queryKey: treeholeQueryKeys.comments(variables.postId) });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.mines() });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.userPostsAll() });
    },
  });
}
