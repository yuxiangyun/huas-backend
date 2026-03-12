import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  useAdminTreeholeCommentsQuery,
  useAdminTreeholePostsQuery,
  useDeleteAdminTreeholeCommentMutation,
  useDeleteAdminTreeholePostMutation,
} from '@/entities/admin/api/admin-queries';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import { useToastStore } from '@/app/state/toast-store';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { ApiError } from '@/shared/api/http-client';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';

const fieldClassName =
  'h-11 w-full rounded-[1rem] border border-line bg-white/86 px-3 text-sm text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-black/10';

function parsePositiveParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function AdminTreeholeSubPage() {
  const { session, onUnauthorized } = useAdminOutletContext();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parsePositiveParam(searchParams.get('page'), 1);
  const keyword = searchParams.get('keyword') ?? '';
  const rawPostId = Number(searchParams.get('postId'));
  const postId = Number.isInteger(rawPostId) && rawPostId > 0 ? rawPostId : null;
  const commentsPage = parsePositiveParam(searchParams.get('commentsPage'), 1);
  const [keywordInput, setKeywordInput] = useState(keyword);

  useEffect(() => {
    setKeywordInput(keyword);
  }, [keyword]);

  const postsQuery = useAdminTreeholePostsQuery(session, {
    keyword: keyword || undefined,
    page,
    pageSize: 10,
  });

  const selectedPost = postsQuery.data?.items.find((item) => item.id === postId) ?? null;

  const commentsQuery = useAdminTreeholeCommentsQuery(session, selectedPost?.id ?? null, {
    page: commentsPage,
    pageSize: 20,
  });

  const deletePostMutation = useDeleteAdminTreeholePostMutation(session);
  const deleteCommentMutation = useDeleteAdminTreeholeCommentMutation(session);
  const [pendingDeletePostId, setPendingDeletePostId] = useState<number | null>(null);
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState<number | null>(null);

  function patchSearchParams(patcher: (params: URLSearchParams) => void) {
    const nextParams = new URLSearchParams(searchParams);
    patcher(nextParams);

    if (!nextParams.get('keyword')) {
      nextParams.delete('keyword');
    }
    if (!nextParams.get('page') || nextParams.get('page') === '1') {
      nextParams.delete('page');
    }
    if (!nextParams.get('postId')) {
      nextParams.delete('postId');
    }
    if (!nextParams.get('commentsPage') || nextParams.get('commentsPage') === '1') {
      nextParams.delete('commentsPage');
    }

    setSearchParams(nextParams);
  }

  useEffect(() => {
    if (!(postsQuery.error instanceof ApiError) || postsQuery.error.httpStatus !== 401) return;
    onUnauthorized('管理员会话已失效，请重新登录');
  }, [onUnauthorized, postsQuery.error]);

  useEffect(() => {
    if (!(commentsQuery.error instanceof ApiError)) return;

    if (commentsQuery.error.httpStatus === 401) {
      onUnauthorized('管理员会话已失效，请重新登录');
      return;
    }

    if (commentsQuery.error.httpStatus === 404) {
      patchSearchParams((params) => {
        params.delete('postId');
        params.delete('commentsPage');
      });
      void postsQuery.refetch();
      pushToast({
        title: '当前树洞已不存在',
        variant: 'info',
      });
    }
  }, [commentsQuery.error, onUnauthorized, postsQuery.refetch, pushToast]);

  useEffect(() => {
    if (!postId || !postsQuery.data) return;
    if (postsQuery.data.items.some((item) => item.id === postId)) return;

    patchSearchParams((params) => {
      params.delete('postId');
      params.delete('commentsPage');
    });
  }, [postId, postsQuery.data]);

  async function handleDeletePost(nextPostId: number) {
    try {
      await deletePostMutation.mutateAsync({ postId: nextPostId });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.treeholePostsAll() });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.treeholeCommentsByPost(nextPostId) });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.logsAll() });

      if (postId === nextPostId) {
        patchSearchParams((params) => {
          params.delete('postId');
          params.delete('commentsPage');
        });
      }

      pushToast({
        title: `树洞 #${nextPostId} 已删除`,
        variant: 'success',
      });
      setPendingDeletePostId(null);
    } catch (error) {
      if (error instanceof ApiError && error.httpStatus === 401) {
        onUnauthorized('管理员会话已失效，请重新登录');
        return;
      }
      pushToast({
        title: '删除树洞失败',
        message: getErrorMessage(error, '请稍后重试'),
        variant: 'error',
      });
    }
  }

  async function handleDeleteComment(commentId: number) {
    try {
      const removed = await deleteCommentMutation.mutateAsync({ commentId });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.treeholePostsAll() });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.treeholeCommentsByPost(removed.postId) });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.logsAll() });
      pushToast({
        title: `评论 #${commentId} 已删除`,
        variant: 'success',
      });
      setPendingDeleteCommentId(null);
    } catch (error) {
      if (error instanceof ApiError && error.httpStatus === 401) {
        onUnauthorized('管理员会话已失效，请重新登录');
        return;
      }
      pushToast({
        title: '删除评论失败',
        message: getErrorMessage(error, '请稍后重试'),
        variant: 'error',
      });
    }
  }

  const totalPages = postsQuery.data ? Math.max(1, Math.ceil(postsQuery.data.total / postsQuery.data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="space-y-1.5 bg-card-strong">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">树洞总数</p>
          <p className="text-[1.6rem] font-semibold tracking-[-0.04em] text-ink">
            {postsQuery.data?.summary.totalPosts ?? 0}
          </p>
        </Card>
        <Card className="space-y-1.5 bg-card-strong">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">评论总数</p>
          <p className="text-[1.6rem] font-semibold tracking-[-0.04em] text-ink">
            {postsQuery.data?.summary.totalComments ?? 0}
          </p>
        </Card>
        <Card className="space-y-1.5 bg-card-strong">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">点赞总数</p>
          <p className="text-[1.6rem] font-semibold tracking-[-0.04em] text-ink">
            {postsQuery.data?.summary.totalLikes ?? 0}
          </p>
        </Card>
      </div>

      <Card className="space-y-4 bg-card-strong">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className={fieldClassName}
            placeholder="搜索树洞内容、学号、姓名或班级"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              patchSearchParams((params) => {
                const nextKeyword = keywordInput.trim();
                if (nextKeyword) {
                  params.set('keyword', nextKeyword);
                } else {
                  params.delete('keyword');
                }
                params.delete('page');
                params.delete('postId');
                params.delete('commentsPage');
              });
            }}
          />
          <Button
            size="md"
            type="button"
            variant="secondary"
            onClick={() => {
              patchSearchParams((params) => {
                const nextKeyword = keywordInput.trim();
                if (nextKeyword) {
                  params.set('keyword', nextKeyword);
                } else {
                  params.delete('keyword');
                }
                params.delete('page');
                params.delete('postId');
                params.delete('commentsPage');
              });
            }}
          >
            搜索
          </Button>
          <Button
            size="md"
            type="button"
            variant="ghost"
            onClick={() => {
              setKeywordInput('');
              patchSearchParams((params) => {
                params.delete('keyword');
                params.delete('page');
                params.delete('postId');
                params.delete('commentsPage');
              });
            }}
          >
            重置
          </Button>
          <Button
            size="md"
            type="button"
            variant="subtle"
            onClick={() => {
              void postsQuery.refetch();
              if (selectedPost) {
                void commentsQuery.refetch();
              }
            }}
          >
            刷新
          </Button>
        </div>

        {postsQuery.isError ? (
          <div className="rounded-[1rem] bg-[#fde9e5] px-4 py-3 text-sm leading-6 text-[#8a342c] ring-1 ring-[#efc9c0]">
            {getErrorMessage(postsQuery.error, '树洞列表加载失败')}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <Card className="overflow-hidden bg-card-strong p-0">
          <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
            <div>
              <p className="text-base font-semibold text-ink">树洞列表</p>
              <p className="text-sm leading-6 text-muted">
                {postsQuery.data ? `共 ${postsQuery.data.total} 条，当前第 ${postsQuery.data.page} / ${totalPages} 页` : '等待加载'}
              </p>
            </div>
            <span className="text-sm text-muted">{keyword ? `关键词：${keyword}` : '全部内容'}</span>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full table-fixed text-left text-sm">
              <thead className="bg-white/72 text-muted">
                <tr>
                  <th className="w-[5.5rem] px-4 py-3 font-medium">ID</th>
                  <th className="w-[9rem] px-4 py-3 font-medium">作者</th>
                  <th className="px-4 py-3 font-medium">内容</th>
                  <th className="w-[6rem] px-4 py-3 font-medium">互动</th>
                  <th className="w-[10rem] px-4 py-3 font-medium">发布时间</th>
                  <th className="w-[10rem] px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {(postsQuery.data?.items ?? []).map((post) => (
                  <tr key={post.id} className="border-t border-line/70 align-top">
                    <td className="px-4 py-3 font-mono text-ink">#{post.id}</td>
                    <td className="px-4 py-3 text-muted">
                      {[post.author.studentId, post.author.name, post.author.className].filter(Boolean).join(' · ')}
                    </td>
                    <td className="px-4 py-3 text-ink">{post.content}</td>
                    <td className="px-4 py-3 text-muted">{post.stats.likeCount} / {post.stats.commentCount}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(post.publishedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="xs"
                          type="button"
                          variant={selectedPost?.id === post.id ? 'primary' : 'secondary'}
                          onClick={() =>
                            patchSearchParams((params) => {
                              params.set('postId', String(post.id));
                              params.delete('commentsPage');
                            })
                          }
                        >
                          {selectedPost?.id === post.id ? '已选中' : '看评论'}
                        </Button>
                        <Button
                          size="xs"
                          type="button"
                          variant="danger"
                          disabled={deletePostMutation.isPending}
                          onClick={() => setPendingDeletePostId(post.id)}
                        >
                          删帖
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!postsQuery.isLoading && (postsQuery.data?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted" colSpan={6}>暂无匹配树洞</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {postsQuery.data ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-4 py-3">
              <Button
                size="sm"
                type="button"
                variant="secondary"
                disabled={postsQuery.data.page <= 1}
                onClick={() =>
                  patchSearchParams((params) => {
                    params.set('page', String(Math.max(1, postsQuery.data!.page - 1)));
                    params.delete('postId');
                    params.delete('commentsPage');
                  })
                }
              >
                上一页
              </Button>
              <span className="text-sm text-muted">第 {postsQuery.data.page} / {totalPages} 页</span>
              <Button
                size="sm"
                type="button"
                variant="secondary"
                disabled={!postsQuery.data.hasMore}
                onClick={() =>
                  patchSearchParams((params) => {
                    params.set('page', String(postsQuery.data!.page + 1));
                    params.delete('postId');
                    params.delete('commentsPage');
                  })
                }
              >
                下一页
              </Button>
            </div>
          ) : null}
        </Card>

        <Card className="overflow-hidden bg-card-strong p-0">
          <div className="border-b border-line/70 px-4 py-3">
            <p className="text-base font-semibold text-ink">评论面板</p>
            <p className="text-sm leading-6 text-muted">
              {selectedPost ? `当前树洞 #${selectedPost.id}` : '从左侧选择树洞后查看评论'}
            </p>
          </div>

          {!selectedPost ? (
            <div className="px-4 py-8 text-sm text-muted">未选中树洞。</div>
          ) : (
            <>
              <div className="border-b border-line/70 px-4 py-3 text-sm text-muted">
                {[selectedPost.author.studentId, selectedPost.author.name, selectedPost.author.className].filter(Boolean).join(' · ')}
              </div>

              {commentsQuery.isError && !(commentsQuery.error instanceof ApiError && commentsQuery.error.httpStatus === 404) ? (
                <div className="px-4 py-4 text-sm text-[#8a342c]">
                  {getErrorMessage(commentsQuery.error, '评论加载失败')}
                </div>
              ) : null}

              <div className="max-h-[35rem] overflow-auto">
                <table className="min-w-full table-fixed text-left text-sm">
                  <thead className="bg-white/72 text-muted">
                    <tr>
                      <th className="w-[5rem] px-4 py-3 font-medium">ID</th>
                      <th className="w-[8rem] px-4 py-3 font-medium">作者</th>
                      <th className="px-4 py-3 font-medium">内容</th>
                      <th className="w-[8rem] px-4 py-3 font-medium">时间</th>
                      <th className="w-[5rem] px-4 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(commentsQuery.data?.items ?? []).map((comment) => (
                      <tr key={comment.id} className="border-t border-line/70 align-top">
                        <td className="px-4 py-3 font-mono text-ink">#{comment.id}</td>
                        <td className="px-4 py-3 text-muted">
                          {[comment.author.studentId, comment.author.name, comment.author.className].filter(Boolean).join(' · ')}
                        </td>
                        <td className="px-4 py-3 text-ink">{comment.content}</td>
                        <td className="px-4 py-3 text-muted">{formatDateTime(comment.createdAt)}</td>
                        <td className="px-4 py-3">
                          <Button
                            size="xs"
                            type="button"
                            variant="danger"
                            disabled={deleteCommentMutation.isPending}
                            onClick={() => setPendingDeleteCommentId(comment.id)}
                          >
                            删除
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!commentsQuery.isLoading && (commentsQuery.data?.items.length ?? 0) === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-muted" colSpan={5}>该树洞暂无评论</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {commentsQuery.data ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-4 py-3">
                  <Button
                    size="sm"
                    type="button"
                    variant="secondary"
                    disabled={commentsQuery.data.page <= 1}
                    onClick={() =>
                      patchSearchParams((params) => {
                        params.set('commentsPage', String(Math.max(1, commentsQuery.data!.page - 1)));
                      })
                    }
                  >
                    上一页
                  </Button>
                  <span className="text-sm text-muted">
                    第 {commentsQuery.data.page} / {Math.max(1, Math.ceil(commentsQuery.data.total / commentsQuery.data.pageSize))} 页
                  </span>
                  <Button
                    size="sm"
                    type="button"
                    variant="secondary"
                    disabled={!commentsQuery.data.hasMore}
                    onClick={() =>
                      patchSearchParams((params) => {
                        params.set('commentsPage', String(commentsQuery.data!.page + 1));
                      })
                    }
                  >
                    下一页
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>

      <ConfirmSheet
        open={pendingDeletePostId !== null}
        busy={deletePostMutation.isPending}
        title={pendingDeletePostId ? `确认删除树洞 #${pendingDeletePostId}？` : '确认删除该树洞？'}
        description="删除后不可恢复。"
        confirmLabel="确认删帖"
        tone="danger"
        onClose={() => setPendingDeletePostId(null)}
        onConfirm={() => {
          if (pendingDeletePostId === null) return;
          void handleDeletePost(pendingDeletePostId);
        }}
      />

      <ConfirmSheet
        open={pendingDeleteCommentId !== null}
        busy={deleteCommentMutation.isPending}
        title={pendingDeleteCommentId ? `确认删除评论 #${pendingDeleteCommentId}？` : '确认删除该评论？'}
        description="删除后不可恢复。"
        confirmLabel="确认删除"
        tone="danger"
        onClose={() => setPendingDeleteCommentId(null)}
        onConfirm={() => {
          if (pendingDeleteCommentId === null) return;
          void handleDeleteComment(pendingDeleteCommentId);
        }}
      />
    </div>
  );
}
