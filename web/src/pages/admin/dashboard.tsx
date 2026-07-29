/**
 * [INPUT]: 依赖后台 dashboard/analytics 查询、dither-kit area/bar 图表与后台会话上下文
 * [OUTPUT]: 提供 AdminDashboardPage，展示业务趋势与数据库、进程、缓存运行状态
 * [POS]: pages/admin 的默认总览页，把业务洞察和已有运行遥测收敛为单次可读视图
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useMemo, useState } from 'react';
import { AreaChart } from '@/components/dither-kit/area-chart';
import { Area } from '@/components/dither-kit/area';
import { BarChart } from '@/components/dither-kit/bar-chart';
import { Bar } from '@/components/dither-kit/bar';
import { Grid } from '@/components/dither-kit/grid';
import { Legend } from '@/components/dither-kit/legend';
import { Tooltip } from '@/components/dither-kit/tooltip';
import { XAxis } from '@/components/dither-kit/x-axis';
import { YAxis } from '@/components/dither-kit/y-axis';
import { useAdminAnalyticsQuery, useAdminDashboardQuery } from '@/entities/admin/api/admin-queries';
import { useAdminOutletContext } from '@/pages/admin/layout';

type Period = 7 | 30 | 90;
type Point = Record<string, string | number>;

const PLATFORM_CONFIG = {
  'active.miniprogram': { label: '小程序', color: 'grey' },
  'active.web': { label: 'Web', color: 'green' },
} as const;

const FEATURE_CONFIG = {
  schedule: { label: '课表', color: 'blue' },
  grades: { label: '成绩', color: 'purple' },
  evaluations: { label: '评教', color: 'grey' },
  ecard: { label: '一卡通', color: 'green' },
  classrooms: { label: '空教室', color: 'orange' },
  calendar: { label: '日历订阅', color: 'grey' },
  discover: { label: '好饭', color: 'pink' },
  treehole: { label: '树洞', color: 'red' },
} as const;

const PLATFORMS = ['miniprogram', 'web'] as const;
const FEATURES = Object.keys(FEATURE_CONFIG) as Array<keyof typeof FEATURE_CONFIG>;

function valueOf(point: Point, key: string) {
  const value = point[key];
  return typeof value === 'number' ? value : 0;
}

function sumSeries(series: Point[], metric: string) {
  return series.reduce(
    (total, point) => total + PLATFORMS.reduce((sum, platform) => sum + valueOf(point, `${metric}.${platform}`), 0),
    0
  );
}

function formatDay(value: unknown) {
  const day = String(value ?? '');
  return day.length >= 10 ? day.slice(5).replace('-', '/') : day;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-[0.75rem] border border-line bg-white px-4 py-4 shadow-card">
      <p className="text-[0.72rem] font-medium tracking-[0.04em] text-muted">{label}</p>
      <p className="mt-2 text-[1.75rem] font-semibold tracking-[-0.045em] text-ink tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </article>
  );
}

function ChartCard({ title, meta, children, className = '' }: {
  title: string;
  meta: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[0.75rem] border border-line bg-white p-4 shadow-card sm:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
          <p className="mt-1 text-xs text-muted">{meta}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ note }: { note: string }) {
  return <div className="grid h-full place-items-center rounded-[0.625rem] bg-tint-soft text-center"><div><p className="text-sm font-medium text-muted">暂无数据</p><p className="mt-1 text-xs text-muted">{note}</p></div></div>;
}

export function AdminDashboardPage() {
  const { session } = useAdminOutletContext();
  const [period, setPeriod] = useState<Period>(30);
  const analyticsQuery = useAdminAnalyticsQuery(session, period);
  const dashboardQuery = useAdminDashboardQuery(session, { page: 1 });

  const series = (analyticsQuery.data?.series ?? []) as Point[];
  const latest = series.at(-1) ?? {};
  const activeToday = PLATFORMS.reduce((sum, platform) => sum + valueOf(latest, `active.${platform}`), 0);
  const featureTotal = FEATURES.reduce((sum, feature) => sum + sumSeries(series, `feature.${feature}`), 0);
  const activeTotal = sumSeries(series, 'active');
  const loginSuccess = sumSeries(series, 'login.success');
  const loginFailure = sumSeries(series, 'login.failure');
  const serverErrors = sumSeries(series, 'request.server_error');
  const requests = sumSeries(series, 'request.total');
  const metrics = dashboardQuery.data?.metrics;

  const featureSeries = useMemo(() => series.map((point) => {
    const next: Point = { day: point.day };
    for (const feature of FEATURES) {
      next[feature] = PLATFORMS.reduce(
        (sum, platform) => sum + valueOf(point, `feature.${feature}.${platform}`),
        0
      );
    }
    return next;
  }), [series]);

  const majorSeries = useMemo(() =>
    (dashboardQuery.data?.distributions.byMajor ?? []).slice(0, 10).map((item) => ({
      label: item.className || '未分配',
      users: item.count,
    })), [dashboardQuery.data]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">概览</h1>
        <div className="inline-flex w-fit rounded-[0.75rem] bg-tint-soft p-1" aria-label="时间范围">
          {([7, 30, 90] as const).map((value) => (
            <button
              key={value}
              className={`rounded-[0.6rem] px-3 py-1.5 text-xs font-medium transition ${period === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
              type="button"
              onClick={() => setPeriod(value)}
            >
              {value} 天
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="今日活跃" value={activeToday.toLocaleString()} note="去重用户" />
        <MetricCard label="近 7 天新增" value={(metrics?.newUsers7d ?? 0).toLocaleString()} note="首次登录用户" />
        <MetricCard label="登录成功率" value={`${loginSuccess + loginFailure ? Math.round(loginSuccess / (loginSuccess + loginFailure) * 1000) / 10 : 0}%`} note={`${loginSuccess + loginFailure} 次尝试`} />
        <MetricCard label="核心功能使用" value={featureTotal.toLocaleString()} note={`过去 ${period} 天`} />
        <MetricCard label="内容与评分" value={((metrics?.totalDiscoverPosts ?? 0) + (metrics?.totalDiscoverRatings ?? 0)).toLocaleString()} note="当前有效总量" />
        <MetricCard label="服务端错误率" value={`${requests ? Math.round(serverErrors / requests * 10000) / 100 : 0}%`} note={`${serverErrors} / ${requests}`} />
      </section>

      <ChartCard
        title="运行状态"
        meta={dashboardQuery.data?.service.timestamp
          ? `采样于 ${new Date(dashboardQuery.data.service.timestamp).toLocaleString('zh-CN', { hour12: false })}`
          : '等待运行数据'}
      >
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
          <MetricCard
            label="数据库"
            value={dashboardQuery.data ? (dashboardQuery.data.service.status === 'ok' ? '正常' : '异常') : '-'}
            note="SQLite 连通性"
          />
          <MetricCard
            label="进程运行"
            value={metrics ? formatDuration(metrics.uptimeSeconds) : '-'}
            note="本次启动至今"
          />
          <MetricCard
            label="常驻内存"
            value={metrics ? `${metrics.memory.rssMb.toLocaleString()} MB` : '-'}
            note={metrics ? `Heap ${metrics.memory.heapUsedMb.toLocaleString()} / ${metrics.memory.heapTotalMb.toLocaleString()} MB` : '进程 RSS'}
          />
          <MetricCard
            label="缓存条目"
            value={metrics ? metrics.cacheEntries.toLocaleString() : '-'}
            note="本地 SQLite cache"
          />
          <MetricCard
            label="凭证记录"
            value={metrics ? metrics.credentialEntries.toLocaleString() : '-'}
            note="校园系统凭证"
          />
        </div>
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-12">
        <ChartCard title="活跃用户" meta={`过去 ${period} 天 · 按渠道`} className="xl:col-span-8">
          <div className="h-[20rem] sm:h-[23rem]">
            {activeTotal === 0 ? <EmptyChart note="渠道数据自接入日起统计" /> : <AreaChart data={series} config={PLATFORM_CONFIG} bloom="low" bloomOnHover>
              <Grid />
              <XAxis dataKey="day" tickFormatter={formatDay} maxTicks={period === 90 ? 6 : 8} />
              <YAxis />
              <Area dataKey="active.miniprogram" variant="solid" />
              <Area dataKey="active.web" variant="dotted" />
              <Legend isClickable />
              <Tooltip labelKey="day" />
            </AreaChart>}
          </div>
        </ChartCard>

        <ChartCard title="专业分布" meta="当前用户数 · 前 10 项" className="xl:col-span-4">
          <div className="h-[20rem] sm:h-[23rem]">
            {majorSeries.length === 0 ? <EmptyChart note="当前没有用户分布记录" /> : <BarChart data={majorSeries} config={{ users: { label: '用户', color: 'grey' } }} bloom="low" bloomOnHover>
              <Grid />
              <XAxis dataKey="label" tickFormatter={(value) => String(value).slice(0, 4)} maxTicks={5} />
              <YAxis />
              <Bar dataKey="users" variant="solid" />
              <Tooltip labelKey="label" />
            </BarChart>}
          </div>
        </ChartCard>
      </div>

      <ChartCard title="核心功能使用" meta={`过去 ${period} 天 · 全部渠道`}>
        <div className="h-[22rem] sm:h-[26rem]">
          {featureTotal === 0 ? <EmptyChart note="功能使用数据自接入日起统计" /> : <BarChart data={featureSeries} config={FEATURE_CONFIG} stackType="stacked" bloom="low" bloomOnHover>
            <Grid />
            <XAxis dataKey="day" tickFormatter={formatDay} maxTicks={period === 90 ? 6 : 10} />
            <YAxis />
            {FEATURES.map((feature, index) => (
              <Bar key={feature} dataKey={feature} variant={index % 3 === 0 ? 'solid' : index % 3 === 1 ? 'dotted' : 'hatched'} />
            ))}
            <Legend isClickable align="left" />
            <Tooltip labelKey="day" />
          </BarChart>}
        </div>
      </ChartCard>

      {analyticsQuery.isError || dashboardQuery.isError ? <p className="text-sm text-error">部分数据加载失败</p> : null}
    </div>
  );
}
