import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminDashboardQuery } from '@/entities/admin/api/admin-queries';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { ApiError } from '@/shared/api/http-client';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

const fieldClassName =
  'h-11 w-full rounded-[1rem] border border-line bg-white/86 px-3 text-sm text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-black/10';

function parsePositiveParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUptime(seconds: number) {
  const s = Math.max(0, Number(seconds || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}天 ${h}小时 ${m}分`;
  if (h > 0) return `${h}小时 ${m}分 ${sec}秒`;
  return `${m}分 ${sec}秒`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function AdminDashboardPage() {
  const { session, onUnauthorized } = useAdminOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parsePositiveParam(searchParams.get('page'), 1);
  const search = searchParams.get('search') ?? '';
  const major = searchParams.get('major') ?? '';
  const grade = searchParams.get('grade') ?? '';
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const dashboardQuery = useAdminDashboardQuery(session, {
    page,
    search: search || undefined,
    major: major || undefined,
    grade: grade || undefined,
  });

  useEffect(() => {
    if (!(dashboardQuery.error instanceof ApiError) || dashboardQuery.error.httpStatus !== 401) return;
    onUnauthorized('管理员会话已失效，请重新登录');
  }, [dashboardQuery.error, onUnauthorized]);

  function patchSearchParams(patcher: (params: URLSearchParams) => void) {
    const nextParams = new URLSearchParams(searchParams);
    patcher(nextParams);

    if (!nextParams.get('page') || nextParams.get('page') === '1') {
      nextParams.delete('page');
    }
    if (!nextParams.get('search')) {
      nextParams.delete('search');
    }
    if (!nextParams.get('major')) {
      nextParams.delete('major');
    }
    if (!nextParams.get('grade')) {
      nextParams.delete('grade');
    }

    setSearchParams(nextParams);
  }

  const summaryItems = useMemo(() => {
    if (!dashboardQuery.data) return [];

    return [
      { label: '总用户数', value: dashboardQuery.data.metrics.totalUsers.toLocaleString('en-US') },
      { label: '今日活跃', value: dashboardQuery.data.metrics.todayActiveUsers.toLocaleString('en-US') },
      { label: '近7天活跃', value: dashboardQuery.data.metrics.activeUsers7d.toLocaleString('en-US') },
      { label: '近7天新增', value: dashboardQuery.data.metrics.newUsers7d.toLocaleString('en-US') },
      { label: '缓存条数', value: dashboardQuery.data.metrics.cacheEntries.toLocaleString('en-US') },
      { label: '凭证条数', value: dashboardQuery.data.metrics.credentialEntries.toLocaleString('en-US') },
      { label: 'Discover 帖子', value: dashboardQuery.data.metrics.totalDiscoverPosts.toLocaleString('en-US') },
      { label: 'Discover 评分', value: dashboardQuery.data.metrics.totalDiscoverRatings.toLocaleString('en-US') },
      { label: 'RSS 内存', value: `${dashboardQuery.data.metrics.memory.rssMb} MB` },
      { label: '运行时长', value: formatUptime(dashboardQuery.data.metrics.uptimeSeconds) },
    ];
  }, [dashboardQuery.data]);

  const users = dashboardQuery.data?.users;
  const totalPages = users?.totalPages ?? 1;

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {dashboardQuery.isLoading
          ? Array.from({ length: 10 }, (_, index) => (
              <Card key={index} className="space-y-2 bg-card-strong">
                <div className="h-3 w-20 animate-pulse rounded bg-shell-strong" />
                <div className="h-7 w-16 animate-pulse rounded bg-shell-strong" />
              </Card>
            ))
          : summaryItems.map((item) => (
              <Card key={item.label} className="space-y-2 bg-card-strong">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">{item.label}</p>
                <p className="text-[1.5rem] font-semibold tracking-[-0.04em] text-ink">{item.value}</p>
              </Card>
            ))}
      </section>

      {dashboardQuery.data ? (
        <section className="grid gap-3 lg:grid-cols-3">
          <Card className="space-y-2 bg-card-strong lg:col-span-2">
            <p className="text-base font-semibold text-ink">系统状态</p>
            <p className="text-sm leading-6 text-muted">
              服务状态：
              <span className={dashboardQuery.data.service.status === 'ok' ? 'ml-1 text-[#216a4c]' : 'ml-1 text-[#8d3a35]'}>
                {dashboardQuery.data.service.status === 'ok' ? '正常' : '异常'}
              </span>
            </p>
            <p className="text-sm leading-6 text-muted">服务时间：{formatDateTime(dashboardQuery.data.service.timestamp)}</p>
            <p className="text-sm leading-6 text-muted">Heap Used：{dashboardQuery.data.metrics.memory.heapUsedMb} MB</p>
            <p className="text-sm leading-6 text-muted">Heap Total：{dashboardQuery.data.metrics.memory.heapTotalMb} MB</p>
          </Card>

          <Card className="space-y-3 bg-card-strong">
            <p className="text-base font-semibold text-ink">分布概览</p>
            <div className="space-y-2 text-sm text-muted">
              <p>专业数：{dashboardQuery.data.distributions.byMajor.length}</p>
              <p>年级数：{dashboardQuery.data.distributions.byGrade.length}</p>
              <p>用户分页：{users?.pageSize ?? 20} / 页</p>
            </div>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-3 xl:grid-cols-2">
        <Card className="overflow-hidden bg-card-strong p-0">
          <div className="border-b border-line/70 px-4 py-3">
            <p className="text-base font-semibold text-ink">专业分布</p>
          </div>
          <div className="max-h-[22rem] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/72 text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">专业</th>
                  <th className="px-4 py-3 font-medium">人数</th>
                </tr>
              </thead>
              <tbody>
                {(dashboardQuery.data?.distributions.byMajor ?? []).map((item) => (
                  <tr key={`${item.className}-${item.count}`} className="border-t border-line/70">
                    <td className="px-4 py-3 text-ink">{item.className || '未分配'}</td>
                    <td className="px-4 py-3 text-muted">{item.count.toLocaleString('en-US')}</td>
                  </tr>
                ))}
                {!dashboardQuery.isLoading && (dashboardQuery.data?.distributions.byMajor.length ?? 0) === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted" colSpan={2}>暂无数据</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden bg-card-strong p-0">
          <div className="border-b border-line/70 px-4 py-3">
            <p className="text-base font-semibold text-ink">年级分布</p>
          </div>
          <div className="max-h-[22rem] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/72 text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">年级</th>
                  <th className="px-4 py-3 font-medium">人数</th>
                </tr>
              </thead>
              <tbody>
                {(dashboardQuery.data?.distributions.byGrade ?? []).map((item) => (
                  <tr key={`${item.grade}-${item.count}`} className="border-t border-line/70">
                    <td className="px-4 py-3 text-ink">{item.grade}</td>
                    <td className="px-4 py-3 text-muted">{item.count.toLocaleString('en-US')}</td>
                  </tr>
                ))}
                {!dashboardQuery.isLoading && (dashboardQuery.data?.distributions.byGrade.length ?? 0) === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted" colSpan={2}>暂无数据</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <Card className="space-y-4 bg-card-strong">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-base font-semibold text-ink">用户筛选</p>
            <p className="text-sm leading-6 text-muted">支持按学号、姓名、专业和年级过滤。</p>
          </div>
          <Button
            size="sm"
            type="button"
            variant="subtle"
            onClick={() => void dashboardQuery.refetch()}
          >
            刷新
          </Button>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <input
            className={fieldClassName}
            placeholder="输入学号或姓名"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              patchSearchParams((params) => {
                const nextSearch = searchInput.trim();
                if (nextSearch) {
                  params.set('search', nextSearch);
                } else {
                  params.delete('search');
                }
                params.delete('page');
              });
            }}
          />

          <select
            className={fieldClassName}
            value={major}
            onChange={(event) => {
              const nextMajor = event.target.value;
              patchSearchParams((params) => {
                if (nextMajor) {
                  params.set('major', nextMajor);
                } else {
                  params.delete('major');
                }
                params.delete('page');
              });
            }}
          >
            <option value="">全部专业</option>
            {(dashboardQuery.data?.users.options.majors ?? []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            className={fieldClassName}
            value={grade}
            onChange={(event) => {
              const nextGrade = event.target.value;
              patchSearchParams((params) => {
                if (nextGrade) {
                  params.set('grade', nextGrade);
                } else {
                  params.delete('grade');
                }
                params.delete('page');
              });
            }}
          >
            <option value="">全部年级</option>
            {(dashboardQuery.data?.users.options.grades ?? []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <Button
            size="md"
            type="button"
            variant="secondary"
            onClick={() => {
              patchSearchParams((params) => {
                const nextSearch = searchInput.trim();
                if (nextSearch) {
                  params.set('search', nextSearch);
                } else {
                  params.delete('search');
                }
                params.delete('page');
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
              setSearchInput('');
              patchSearchParams((params) => {
                params.delete('search');
                params.delete('major');
                params.delete('grade');
                params.delete('page');
              });
            }}
          >
            重置
          </Button>
        </div>

        {dashboardQuery.isError ? (
          <div className="rounded-[1rem] bg-[#fde9e5] px-4 py-3 text-sm leading-6 text-[#8a342c] ring-1 ring-[#efc9c0]">
            {getErrorMessage(dashboardQuery.error, '用户列表加载失败')}
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden bg-card-strong p-0">
        <div className="border-b border-line/70 px-4 py-3">
          <p className="text-base font-semibold text-ink">用户列表</p>
          <p className="text-sm leading-6 text-muted">
            {users ? `总计 ${users.total} 条，当前第 ${users.page} / ${users.totalPages} 页` : '等待加载'}
          </p>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full table-fixed text-left text-sm">
            <thead className="bg-white/72 text-muted">
              <tr>
                <th className="w-[9rem] px-4 py-3 font-medium">学号</th>
                <th className="w-[8rem] px-4 py-3 font-medium">姓名</th>
                <th className="w-[10rem] px-4 py-3 font-medium">专业</th>
                <th className="w-[6rem] px-4 py-3 font-medium">年级</th>
                <th className="px-4 py-3 font-medium">最后登录</th>
              </tr>
            </thead>
            <tbody>
              {(users?.items ?? []).map((item) => (
                <tr key={`${item.studentId}-${item.lastLoginAt}`} className="border-t border-line/70">
                  <td className="px-4 py-3 font-mono text-ink">{item.studentId}</td>
                  <td className="px-4 py-3 text-ink">{item.name || '-'}</td>
                  <td className="px-4 py-3 text-muted">{item.className || '-'}</td>
                  <td className="px-4 py-3 text-muted">{item.grade || '-'}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(item.lastLoginAt)}</td>
                </tr>
              ))}
              {!dashboardQuery.isLoading && (users?.items.length ?? 0) === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted" colSpan={5}>暂无数据</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {users ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-4 py-3">
            <Button
              size="sm"
              type="button"
              variant="secondary"
              disabled={users.page <= 1}
              onClick={() =>
                patchSearchParams((params) => {
                  params.set('page', String(Math.max(1, users.page - 1)));
                })
              }
            >
              上一页
            </Button>
            <span className="text-sm text-muted">第 {users.page} / {totalPages} 页</span>
            <Button
              size="sm"
              type="button"
              variant="secondary"
              disabled={users.page >= totalPages}
              onClick={() =>
                patchSearchParams((params) => {
                  params.set('page', String(Math.min(totalPages, users.page + 1)));
                })
              }
            >
              下一页
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
