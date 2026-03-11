import { type FormEvent, startTransition, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowClockwise20Filled } from '@fluentui/react-icons/svg/arrow-clockwise';
import { Chat20Filled } from '@fluentui/react-icons/svg/chat';
import { ContactCard20Filled } from '@fluentui/react-icons/svg/contact-card';
import { DoorArrowRight20Filled } from '@fluentui/react-icons/svg/door-arrow-right';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getAdminTreeholePosts,
} from '@/entities/admin-treehole/api/admin-treehole-api';
import {
  useAdminTreeholeCommentsQuery,
  useAdminTerminalLogsQuery,
  useAdminTreeholePostsQuery,
  useDeleteAdminTreeholeCommentMutation,
  useDeleteAdminTreeholePostMutation,
} from '@/entities/admin-treehole/api/admin-treehole-queries';
import { adminTreeholeQueryKeys } from '@/entities/admin-treehole/model/admin-treehole-query-keys';
import type { AdminTreeholePost } from '@/entities/admin-treehole/model/admin-treehole-types';
import { appRoutes } from '@/app/router/paths';
import { useToastStore } from '@/app/state/toast-store';
import {
  clearAdminBasicSession,
  createAdminBasicSession,
  readAdminBasicSession,
  writeAdminBasicSession,
  type AdminBasicSession,
} from '@/features/admin-treehole/model/admin-session';
import { ApiError } from '@/shared/api/http-client';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { PageHeader } from '@/shared/ui/page-header';
import { IconBubble, PageOrnament } from '@/shared/ui/page-ornament';

const fieldClassName =
  'h-12 w-full rounded-[1.15rem] border border-line bg-white/86 px-3.5 text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-black/10';

function parsePositiveParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAuthorLabel(post: AdminTreeholePost) {
  const labels = [post.author.studentId];
  if (post.author.name) {
    labels.push(post.author.name);
  }
  if (post.author.className) {
    labels.push(post.author.className);
  }
  return labels.join(' · ');
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.httpStatus === 401) {
      return '管理员账号或密码错误';
    }
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[1rem] bg-shell-strong ${className}`} />;
}

function parseLogLine(line: string) {
  const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  const level = /\bERROR\b|\bERR\b/i.test(line)
    ? 'ERROR'
    : /\bWARN\b/i.test(line)
      ? 'WARN'
      : /\bINFO\b/i.test(line)
        ? 'INFO'
        : 'LOG';

  return {
    time: tsMatch?.[1] || '-',
    level,
  };
}

export function AdminTreeholePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const [searchParams, setSearchParams] = useSearchParams();
  const [adminSession, setAdminSession] = useState<AdminBasicSession | null>(() => readAdminBasicSession());
  const [username, setUsername] = useState(() => readAdminBasicSession()?.username ?? '');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const keyword = searchParams.get('keyword') ?? '';
  const page = parsePositiveParam(searchParams.get('page'), 1);
  const rawPostId = Number(searchParams.get('postId'));
  const postId = Number.isInteger(rawPostId) && rawPostId > 0 ? rawPostId : null;
  const commentsPage = parsePositiveParam(searchParams.get('commentsPage'), 1);
  const [keywordInput, setKeywordInput] = useState(keyword);

  useEffect(() => {
    setKeywordInput(keyword);
  }, [keyword]);

  const loginMutation = useMutation({
    mutationFn: async (nextSession: AdminBasicSession) =>
      getAdminTreeholePosts(nextSession, { page: 1, pageSize: 1 }),
    onSuccess: (_, nextSession) => {
      queryClient.removeQueries({ queryKey: adminTreeholeQueryKeys.all() });
      writeAdminBasicSession(nextSession);
      setAdminSession(nextSession);
      setAuthMessage(null);
      setPassword('');
      pushToast({
        title: '已连接管理后台',
        variant: 'success',
      });
    },
    onError: (error) => {
      setAuthMessage(getErrorMessage(error, '连接后台失败'));
    },
  });

  const postsQuery = useAdminTreeholePostsQuery(adminSession, {
    keyword,
    page,
    pageSize: 10,
  });
  const selectedPost = postsQuery.data?.items.find((item) => item.id === postId) ?? null;
  const commentsQuery = useAdminTreeholeCommentsQuery(adminSession, selectedPost?.id ?? null, {
    page: commentsPage,
    pageSize: 20,
  });
  const logsQuery = useAdminTerminalLogsQuery(adminSession, {
    limit: 24,
    keyword: 'Treehole',
  });

  const deletePostMutation = useDeleteAdminTreeholePostMutation(adminSession);
  const deleteCommentMutation = useDeleteAdminTreeholeCommentMutation(adminSession);

  function patchSearchParams(patcher: (params: URLSearchParams) => void) {
    startTransition(() => {
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
    });
  }

  function resetAdminSession(message?: string) {
    clearAdminBasicSession();
    queryClient.removeQueries({ queryKey: adminTreeholeQueryKeys.all() });
    setAdminSession(null);
    setPassword('');
    setAuthMessage(message ?? null);
    patchSearchParams((params) => {
      params.delete('postId');
      params.delete('commentsPage');
    });
  }

  useEffect(() => {
    if (!adminSession) return;
    if (!(postsQuery.error instanceof ApiError) || postsQuery.error.httpStatus !== 401) return;

    resetAdminSession('管理员会话已失效，请重新登录');
    pushToast({
      title: '后台会话已失效',
      message: '请重新输入管理员账号和密码',
      variant: 'error',
    });
  }, [adminSession, postsQuery.error, pushToast]);

  useEffect(() => {
    if (!(commentsQuery.error instanceof ApiError)) return;

    if (commentsQuery.error.httpStatus === 401) {
      resetAdminSession('管理员会话已失效，请重新登录');
      pushToast({
        title: '后台会话已失效',
        message: '请重新输入管理员账号和密码',
        variant: 'error',
      });
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
  }, [commentsQuery.error, postsQuery.refetch, pushToast]);

  useEffect(() => {
    if (!(logsQuery.error instanceof ApiError) || logsQuery.error.httpStatus !== 401) return;

    resetAdminSession('管理员会话已失效，请重新登录');
    pushToast({
      title: '后台会话已失效',
      message: '请重新输入管理员账号和密码',
      variant: 'error',
    });
  }, [logsQuery.error, pushToast]);

  useEffect(() => {
    if (!postId || !postsQuery.data) return;
    if (postsQuery.data.items.some((item) => item.id === postId)) return;

    patchSearchParams((params) => {
      params.delete('postId');
      params.delete('commentsPage');
    });
  }, [postId, postsQuery.data]);

  async function handleAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setAuthMessage('请输入管理员账号和密码');
      return;
    }

    setAuthMessage(null);
    await loginMutation.mutateAsync(createAdminBasicSession(username, password));
  }

  async function handleDeletePost(nextPostId: number) {
    if (!window.confirm(`确认删除树洞 #${nextPostId} ?`)) return;

    try {
      await deletePostMutation.mutateAsync({ postId: nextPostId });
      queryClient.invalidateQueries({ queryKey: adminTreeholeQueryKeys.postsAll() });
      queryClient.invalidateQueries({ queryKey: adminTreeholeQueryKeys.commentsByPost(nextPostId) });
      queryClient.invalidateQueries({ queryKey: adminTreeholeQueryKeys.logsAll() });

      if (postId === nextPostId) {
        patchSearchParams((params) => {
          params.delete('postId');
          params.delete('commentsPage');
        });
      }

      pushToast({
        title: `已删除树洞 #${nextPostId}`,
        variant: 'success',
      });
    } catch (error) {
      if (error instanceof ApiError && error.httpStatus === 401) {
        resetAdminSession('管理员会话已失效，请重新登录');
      }
      pushToast({
        title: '删除树洞失败',
        message: getErrorMessage(error, '请稍后重试'),
        variant: 'error',
      });
    }
  }

  async function handleDeleteComment(commentId: number) {
    if (!window.confirm(`确认删除评论 #${commentId} ?`)) return;

    try {
      const result = await deleteCommentMutation.mutateAsync({ commentId });
      queryClient.invalidateQueries({ queryKey: adminTreeholeQueryKeys.postsAll() });
      queryClient.invalidateQueries({ queryKey: adminTreeholeQueryKeys.commentsByPost(result.postId) });
      queryClient.invalidateQueries({ queryKey: adminTreeholeQueryKeys.logsAll() });
      pushToast({
        title: `已删除评论 #${commentId}`,
        variant: 'success',
      });
    } catch (error) {
      if (error instanceof ApiError && error.httpStatus === 401) {
        resetAdminSession('管理员会话已失效，请重新登录');
      }
      pushToast({
        title: '删除评论失败',
        message: getErrorMessage(error, '请稍后重试'),
        variant: 'error',
      });
    }
  }

  const summary = postsQuery.data?.summary;
  const totalPages = postsQuery.data ? Math.max(1, Math.ceil(postsQuery.data.total / postsQuery.data.pageSize)) : 1;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-shell px-[var(--space-shell-x)] py-[var(--space-shell-top)] sm:px-6">
      <div className="shell-backdrop absolute inset-0 -z-10" />

      <div className="mx-auto max-w-[76rem] space-y-4 pb-8 sm:space-y-5">
        <PageHeader
          action={(
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                type="button"
                variant="subtle"
                onClick={() => navigate(appRoutes.me)}
              >
                返回应用
              </Button>
              {adminSession ? (
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    resetAdminSession();
                    pushToast({
                      title: '已断开后台',
                      variant: 'info',
                    });
                  }}
                >
                  断开
                </Button>
              ) : null}
            </div>
          )}
          compact
          description="管理员可查看树洞真实作者、评论列表，并直接删帖删评。"
          eyebrow="Admin"
          title="树洞管理"
          visual={(
            <PageOrnament
              badges={[
                {
                  icon: <ContactCard20Filled aria-hidden="true" className="size-3.5" />,
                  label: adminSession?.username || '未连接',
                  tone: 'rose',
                },
                {
                  icon: <Chat20Filled aria-hidden="true" className="size-3.5" />,
                  label: summary ? `${summary.totalPosts} 条树洞` : '等待连接',
                  tone: 'blue',
                },
              ]}
              className="w-full sm:w-[14rem]"
              compact
              icon={<Chat20Filled aria-hidden="true" className="size-6" />}
              label="Moderation"
              title={adminSession ? '已连接管理接口' : '输入后台凭据'}
              tone="rose"
            />
          )}
        />

        {!adminSession ? (
          <div className="mx-auto w-full max-w-[32rem]">
            <Card className="space-y-5 bg-card-strong">
              <div className="space-y-1.5">
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-ink">连接管理员接口</h2>
                <p className="text-sm leading-6 text-muted">
                  当前页面使用后端 `/api/admin/treehole/*` 的 Basic Auth，不会复用普通用户登录态。
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleAdminLogin}>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-ink">管理员账号</span>
                  <input
                    autoComplete="username"
                    className={fieldClassName}
                    placeholder="请输入管理员账号"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-ink">管理员密码</span>
                  <input
                    autoComplete="current-password"
                    className={fieldClassName}
                    placeholder="请输入管理员密码"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>

                {authMessage ? (
                  <div className="rounded-[1.1rem] bg-[#fde9e5] px-4 py-3 text-sm leading-6 text-[#8a342c] ring-1 ring-[#efc9c0]">
                    {authMessage}
                  </div>
                ) : null}

                <Button
                  fullWidth
                  size="lg"
                  type="submit"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? '验证中...' : '进入树洞后台'}
                </Button>
              </form>
            </Card>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="space-y-2 bg-card-strong">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">树洞总数</p>
                {postsQuery.isLoading ? (
                  <SkeletonBlock className="h-10 w-20" />
                ) : (
                  <p className="text-[1.8rem] font-semibold tracking-[-0.05em] text-ink">{summary?.totalPosts ?? 0}</p>
                )}
                <p className="text-sm leading-6 text-muted">当前未删除内容</p>
              </Card>

              <Card className="space-y-2 bg-card-strong">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">评论总数</p>
                {postsQuery.isLoading ? (
                  <SkeletonBlock className="h-10 w-20" />
                ) : (
                  <p className="text-[1.8rem] font-semibold tracking-[-0.05em] text-ink">{summary?.totalComments ?? 0}</p>
                )}
                <p className="text-sm leading-6 text-muted">可直接点进单帖查看</p>
              </Card>

              <Card className="space-y-2 bg-card-strong">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">点赞总数</p>
                {postsQuery.isLoading ? (
                  <SkeletonBlock className="h-10 w-20" />
                ) : (
                  <p className="text-[1.8rem] font-semibold tracking-[-0.05em] text-ink">{summary?.totalLikes ?? 0}</p>
                )}
                <p className="text-sm leading-6 text-muted">跨所有未删除树洞</p>
              </Card>
            </div>

            <Card className="space-y-4 bg-card-strong">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-ink">筛选与刷新</p>
                  <p className="text-sm leading-6 text-muted">
                    支持按内容、学号、姓名、班级检索。
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    type="button"
                    variant="subtle"
                    onClick={() => {
                      void postsQuery.refetch();
                      if (selectedPost) {
                        void commentsQuery.refetch();
                      }
                      void logsQuery.refetch();
                    }}
                  >
                    <ArrowClockwise20Filled
                      aria-hidden="true"
                      className={postsQuery.isFetching || commentsQuery.isFetching || logsQuery.isFetching ? 'size-4 animate-spin' : 'size-4'}
                    />
                    刷新
                  </Button>
                  <Button
                    size="sm"
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
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
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
                  className="sm:min-w-[7rem]"
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
                  应用搜索
                </Button>
              </div>
            </Card>

            {postsQuery.isError ? (
              <Card className="space-y-2">
                <p className="text-base font-semibold text-ink">树洞列表加载失败</p>
                <p className="text-sm leading-6 text-muted">
                  {getErrorMessage(postsQuery.error, '请稍后重试')}
                </p>
              </Card>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.9fr)]">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-1">
                  <div>
                    <p className="text-base font-semibold text-ink">树洞列表</p>
                    <p className="text-sm leading-6 text-muted">
                      {postsQuery.data ? `共 ${postsQuery.data.total} 条命中，当前第 ${postsQuery.data.page} / ${totalPages} 页` : '等待加载'}
                    </p>
                  </div>
                  <div className="text-sm text-muted">
                    {postsQuery.isFetching ? '同步中...' : keyword ? `关键词：${keyword}` : '全部内容'}
                  </div>
                </div>

                {postsQuery.isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }, (_, index) => (
                      <Card key={index} className="space-y-4 bg-card-strong">
                        <SkeletonBlock className="h-4 w-40" />
                        <SkeletonBlock className="h-20 w-full" />
                        <div className="flex gap-2">
                          <SkeletonBlock className="h-9 w-24" />
                          <SkeletonBlock className="h-9 w-24" />
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : null}

                {!postsQuery.isLoading && postsQuery.data?.items.length === 0 ? (
                  <Card className="space-y-2">
                    <p className="text-base font-semibold text-ink">没有匹配的树洞</p>
                    <p className="text-sm leading-6 text-muted">
                      调整关键词后再试。
                    </p>
                  </Card>
                ) : null}

                {postsQuery.data?.items.map((post) => {
                  const active = selectedPost?.id === post.id;

                  return (
                    <Card
                      key={post.id}
                      className={active ? 'bg-[linear-gradient(145deg,rgba(255,240,244,0.94),rgba(255,232,239,0.76))] ring-2 ring-[#efc8d7]' : 'bg-card-strong'}
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-pill bg-white/80 px-3 py-1 text-xs font-medium text-ink ring-1 ring-line">
                                树洞 #{post.id}
                              </span>
                              <span className="rounded-pill bg-[#ffe0e8] px-3 py-1 text-xs font-medium text-[#9d4668] ring-1 ring-[#f1bfd0]">
                                {post.stats.commentCount} 条评论
                              </span>
                            </div>
                            <p className="text-sm leading-6 text-muted">
                              {formatAuthorLabel(post)}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              type="button"
                              variant={active ? 'primary' : 'subtle'}
                              onClick={() =>
                                patchSearchParams((params) => {
                                  params.set('postId', String(post.id));
                                  params.delete('commentsPage');
                                })
                              }
                            >
                              {active ? '正在查看' : '查看评论'}
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              variant="danger"
                              disabled={deletePostMutation.isPending}
                              onClick={() => void handleDeletePost(post.id)}
                            >
                              删除树洞
                            </Button>
                          </div>
                        </div>

                        <p className="text-sm leading-7 whitespace-pre-wrap text-ink">
                          {post.content}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                          <span>{post.stats.likeCount} 个赞</span>
                          <span>{formatDateTime(post.publishedAt)} 发布</span>
                        </div>
                      </div>
                    </Card>
                  );
                })}

                {postsQuery.data ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-1">
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
                    <span className="text-sm text-muted">
                      第 {postsQuery.data.page} / {totalPages} 页
                    </span>
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
              </section>

              <section className="space-y-3">
                <div className="px-1">
                  <p className="text-base font-semibold text-ink">评论面板</p>
                  <p className="text-sm leading-6 text-muted">
                    选中一条树洞后即可查看该帖下所有评论。
                  </p>
                </div>

                {!selectedPost ? (
                  <Card className="space-y-3 bg-card-strong">
                    <div className="flex items-center gap-3">
                      <IconBubble
                        icon={<ContactCard20Filled aria-hidden="true" className="size-5" />}
                        tone="slate"
                      />
                      <div className="space-y-1">
                        <p className="text-base font-semibold text-ink">还没有选中树洞</p>
                        <p className="text-sm leading-6 text-muted">
                          从左侧列表点一条“查看评论”。
                        </p>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <>
                    <Card className="space-y-4 bg-card-strong">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-pill bg-[#deebff] px-3 py-1 text-xs font-medium text-[#1f4fa8] ring-1 ring-[#bfd4ff]">
                              当前树洞 #{selectedPost.id}
                            </span>
                            <span className="rounded-pill bg-white/80 px-3 py-1 text-xs text-muted ring-1 ring-line">
                              {selectedPost.stats.commentCount} 条评论
                            </span>
                          </div>
                          <p className="text-sm leading-6 text-muted">
                            {formatAuthorLabel(selectedPost)}
                          </p>
                        </div>

                        <Button
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            patchSearchParams((params) => {
                              params.delete('postId');
                              params.delete('commentsPage');
                            })
                          }
                        >
                          收起
                        </Button>
                      </div>

                      <p className="text-sm leading-7 whitespace-pre-wrap text-ink">
                        {selectedPost.content}
                      </p>
                    </Card>

                    {commentsQuery.isLoading ? (
                      <div className="space-y-3">
                        {Array.from({ length: 3 }, (_, index) => (
                          <Card key={index} className="space-y-3 bg-card-strong">
                            <SkeletonBlock className="h-4 w-36" />
                            <SkeletonBlock className="h-16 w-full" />
                            <SkeletonBlock className="h-9 w-24" />
                          </Card>
                        ))}
                      </div>
                    ) : null}

                    {commentsQuery.isError && !(commentsQuery.error instanceof ApiError && commentsQuery.error.httpStatus === 404) ? (
                      <Card className="space-y-2">
                        <p className="text-base font-semibold text-ink">评论加载失败</p>
                        <p className="text-sm leading-6 text-muted">
                          {getErrorMessage(commentsQuery.error, '请稍后重试')}
                        </p>
                      </Card>
                    ) : null}

                    {!commentsQuery.isLoading && commentsQuery.data?.items.length === 0 ? (
                      <Card className="space-y-2">
                        <p className="text-base font-semibold text-ink">这条树洞还没有评论</p>
                        <p className="text-sm leading-6 text-muted">
                          可以先保留观察，不需要额外处理。
                        </p>
                      </Card>
                    ) : null}

                    {commentsQuery.data?.items.map((comment) => (
                      <Card key={comment.id} className="space-y-4 bg-card-strong">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-pill bg-white/80 px-3 py-1 text-xs font-medium text-ink ring-1 ring-line">
                                评论 #{comment.id}
                              </span>
                              <span className="rounded-pill bg-[#edf1f5] px-3 py-1 text-xs text-muted ring-1 ring-[#d6dde6]">
                                {formatDateTime(comment.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm leading-6 text-muted">
                              {[comment.author.studentId, comment.author.name, comment.author.className].filter(Boolean).join(' · ')}
                            </p>
                          </div>

                          <Button
                            size="sm"
                            type="button"
                            variant="danger"
                            disabled={deleteCommentMutation.isPending}
                            onClick={() => void handleDeleteComment(comment.id)}
                          >
                            删除评论
                          </Button>
                        </div>

                        <p className="text-sm leading-7 whitespace-pre-wrap text-ink">
                          {comment.content}
                        </p>
                      </Card>
                    ))}

                    {commentsQuery.data ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
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
              </section>
            </div>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <div>
                  <p className="text-base font-semibold text-ink">终端日志</p>
                  <p className="text-sm leading-6 text-muted">
                    最近 24 条包含 `Treehole` 的终端日志，每 10 秒自动刷新一次。
                  </p>
                </div>
                <div className="text-sm text-muted">
                  {logsQuery.isFetching ? '日志同步中...' : '自动刷新已开启'}
                </div>
              </div>

              <Card className="overflow-hidden bg-card-strong p-0">
                {logsQuery.isLoading ? (
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 5 }, (_, index) => (
                      <SkeletonBlock key={index} className="h-12 w-full" />
                    ))}
                  </div>
                ) : null}

                {logsQuery.isError && !(logsQuery.error instanceof ApiError && logsQuery.error.httpStatus === 401) ? (
                  <div className="space-y-2 p-4">
                    <p className="text-base font-semibold text-ink">终端日志加载失败</p>
                    <p className="text-sm leading-6 text-muted">
                      {getErrorMessage(logsQuery.error, '请稍后重试')}
                    </p>
                  </div>
                ) : null}

                {!logsQuery.isLoading && !logsQuery.isError && (logsQuery.data?.items.length ?? 0) === 0 ? (
                  <div className="space-y-2 p-4">
                    <p className="text-base font-semibold text-ink">暂无匹配日志</p>
                    <p className="text-sm leading-6 text-muted">
                      当前 PM2 终端输出里还没有包含 `Treehole` 的最新记录。
                    </p>
                  </div>
                ) : null}

                {logsQuery.data && logsQuery.data.items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-fixed border-collapse text-left text-[0.78rem]">
                      <thead className="bg-white/72 text-muted">
                        <tr>
                          <th className="w-[9.5rem] px-4 py-3 font-medium">时间</th>
                          <th className="w-[4.5rem] px-4 py-3 font-medium">源</th>
                          <th className="w-[5rem] px-4 py-3 font-medium">级别</th>
                          <th className="px-4 py-3 font-medium">内容</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logsQuery.data.items.map((item, index) => {
                          const parsed = parseLogLine(item.line);
                          const levelClass = parsed.level === 'ERROR'
                            ? 'text-[#a13c34]'
                            : parsed.level === 'WARN'
                              ? 'text-[#9a6b12]'
                              : parsed.level === 'INFO'
                                ? 'text-[#24634a]'
                                : 'text-muted';

                          return (
                            <tr
                              key={`${item.source}-${index}-${item.line}`}
                              className="border-t border-line/70 align-top"
                            >
                              <td className="px-4 py-3 font-mono text-muted">{parsed.time}</td>
                              <td className="px-4 py-3 font-mono text-ink">{item.source}</td>
                              <td className={`px-4 py-3 font-mono ${levelClass}`}>{parsed.level}</td>
                              <td className="px-4 py-3 font-mono leading-6 whitespace-pre-wrap text-ink break-all">
                                {item.line}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </Card>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
