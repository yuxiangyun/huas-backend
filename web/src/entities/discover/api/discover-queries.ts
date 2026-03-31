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
  rateDiscoverPost,
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

function replacePostInListCache(oldData: unknown, post: DiscoverPost) {
  if (!oldData || typeof oldData !== 'object' || !('items' in oldData)) {
    if (
      oldData
      && typeof oldData === 'object'
      && 'pages' in oldData
      && Array.isArray((oldData as InfiniteData<{ items: DiscoverPost[] }>).pages)
    ) {
      const typed = oldData as InfiniteData<{ items: DiscoverPost[] }>;
      return {
        ...typed,
        pages: typed.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => (item.id === post.id ? post : item)),
        })),
      };
    }

    return oldData;
  }

  const typed = oldData as { items: DiscoverPost[] };
  return {
    ...typed,
    items: typed.items.map((item) => (item.id === post.id ? post : item)),
  };
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
    },
  });
}

export function useRateDiscoverPostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ postId, score }: { postId: number; score: number }) =>
      rateDiscoverPost(postId, score),
    onSuccess: (post) => {
      queryClient.setQueryData(discoverQueryKeys.detail(post.id), post);
      queryClient.setQueriesData({ queryKey: discoverQueryKeys.lists() }, (oldData) =>
        replacePostInListCache(oldData, post)
      );
      queryClient.setQueriesData({ queryKey: discoverQueryKeys.mines() }, (oldData) =>
        replacePostInListCache(oldData, post)
      );
    },
  });
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
    },
  });
}
