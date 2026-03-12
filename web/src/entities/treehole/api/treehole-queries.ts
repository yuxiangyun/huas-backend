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
  getTreeholeUnreadNotificationCount,
  likeTreeholePost,
  readAllTreeholeNotifications,
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

export function useTreeholeUnreadNotificationCountQuery() {
  return useQuery({
    queryKey: treeholeQueryKeys.unreadCount(),
    queryFn: ({ signal }) => getTreeholeUnreadNotificationCount({ signal }),
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

export function useCreateTreeholePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { content: string }) => createTreeholePost(payload),
    onSuccess: (post) => {
      queryClient.setQueryData(treeholeQueryKeys.detail(post.id), post);
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.mines() });
    },
  });
}

export function useLikeTreeholePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => likeTreeholePost(postId),
    onSuccess: (post) => {
      queryClient.setQueryData(treeholeQueryKeys.detail(post.id), post);
      queryClient.setQueriesData({ queryKey: treeholeQueryKeys.lists() }, (oldData) =>
        replacePostInListCache(oldData, post)
      );
      queryClient.setQueriesData({ queryKey: treeholeQueryKeys.mines() }, (oldData) =>
        replacePostInListCache(oldData, post)
      );
    },
  });
}

export function useUnlikeTreeholePostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId }: { postId: number }) => unlikeTreeholePost(postId),
    onSuccess: (post) => {
      queryClient.setQueryData(treeholeQueryKeys.detail(post.id), post);
      queryClient.setQueriesData({ queryKey: treeholeQueryKeys.lists() }, (oldData) =>
        replacePostInListCache(oldData, post)
      );
      queryClient.setQueriesData({ queryKey: treeholeQueryKeys.mines() }, (oldData) =>
        replacePostInListCache(oldData, post)
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
    },
  });
}

export function useReadAllTreeholeNotificationsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: readAllTreeholeNotifications,
    onSuccess: () => {
      queryClient.setQueryData(treeholeQueryKeys.unreadCount(), { unreadCount: 0 });
      queryClient.invalidateQueries({ queryKey: treeholeQueryKeys.unreadCount() });
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
    },
  });
}
