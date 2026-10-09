/**
 * [INPUT]: 依赖独立账户概览、三渠道 analytics、后台会话、HeroUI 数据组件与共用 TanStack Charts
 * [OUTPUT]: 提供同一内容起始线上的分组账户事实、渠道趋势、所选周期功能调用总数与完整班级排行
 * [POS]: pages/admin 的业务概览；渠道活跃分别展示，调用次数不解释为成功人数
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Label } from '@heroui/react/label';
import { Meter } from '@heroui/react/meter';
import { useMemo, useState } from 'react';
import { useAdminAnalyticsQuery, useAdminOverviewQuery } from '@/entities/admin/api/admin-queries';
import type { AdminTrendDays } from '@/entities/admin/model/admin-types';
import { InsightMetric, TrendPeriod } from '@/pages/admin/insights-ui';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { AdminPage, AdminPanel, AdminState } from '@/shared/ui/admin';
import { TimeSeriesChart } from '@/shared/ui/charts/time-series-chart';

const PLATFORM_CONFIG = {
  'active.miniprogram': { label: '小程序' },
  'active.web': { label: 'Web' },
  'active.unknown': { label: '未知渠道' },
} as const;
const FEATURES = [
  { key: 'schedule', label: '课表' }, { key: 'grades', label: '成绩' },
  { key: 'evaluations', label: '评教' }, { key: 'ecard', label: '一卡通' },
  { key: 'classrooms', label: '空教室' }, { key: 'calendar', label: '日历订阅' },
  { key: 'discover', label: '好饭' }, { key: 'treehole', label: '树洞' },
];
const PLATFORMS = ['miniprogram', 'web', 'unknown'] as const;

function metricValue(point: Record<string, string | number>, key: string) {
  return typeof point[key] === 'number' ? point[key] as number : 0;
}

export function AdminDashboardPage() {
  const { session } = useAdminOutletContext();
  const [days, setDays] = useState<AdminTrendDays>(30);
  const overview = useAdminOverviewQuery(session);
  const analytics = useAdminAnalyticsQuery(session, days);
  const activeSeries = useMemo(() => Object.entries(PLATFORM_CONFIG).map(([id, platform]) => ({
    id,
    label: platform.label,
    values: (analytics.data?.series ?? []).map((point) => ({ date: String(point.day), value: metricValue(point, id) })),
  })), [analytics.data]);
  const features = useMemo(() => FEATURES.map((feature) => ({ ...feature,
    count: (analytics.data?.series ?? []).reduce((total, point) => total + PLATFORMS.reduce((sum, platform) => sum + metricValue(point, `feature.${feature.key}.${platform}`), 0), 0),
  })).sort((left, right) => right.count - left.count), [analytics.data]);
  const maxCalls = Math.max(1, ...features.map((feature) => feature.count));
  const classes = overview.data?.distributions.byClass.slice(0, 10) ?? [];
  const metrics = overview.data?.metrics;

  return <AdminPage title="概览">
    <AdminState loading={overview.isLoading} error={overview.error} onRetry={() => { void overview.refetch(); }} />
    {metrics ? <div className="grid gap-5 border-b border-separator pb-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
        <InsightMetric label="账户" value={metrics.totalUsers} />
        <InsightMetric label="今日活跃" value={metrics.todayActiveUsers} />
        <InsightMetric label="7 日活跃" value={metrics.activeUsers7d} />
        <InsightMetric label="7 日新增" value={metrics.newUsers7d} />
      </dl>
      <dl className="grid grid-cols-2 gap-5 xl:border-l xl:border-separator xl:pl-5">
        <InsightMetric label="好饭图文" value={metrics.totalDiscoverPosts} />
        <InsightMetric label="好饭点赞" value={metrics.totalDiscoverLikes} />
      </dl>
    </div> : null}
    <AdminPanel title="渠道日活跃" actions={<TrendPeriod value={days} onChange={setDays} />}>
      <AdminState loading={analytics.isLoading} error={analytics.error} onRetry={() => { void analytics.refetch(); }} />
      {analytics.data ? <TimeSeriesChart series={activeSeries} ariaLabel="三渠道每日活跃账户趋势" /> : null}
    </AdminPanel>
    <div className="grid gap-8 border-t border-separator pt-5 lg:grid-cols-2">
      {analytics.data ? <AdminPanel title={`${days} 日功能调用`}>
        <div className="grid gap-4">
          {features.map((feature) => <Meter key={feature.key} value={feature.count} maxValue={maxCalls} valueLabel={`${feature.count.toLocaleString('zh-CN')} 次`} size="sm">
            <div className="flex items-center justify-between gap-4"><Label className="text-sm">{feature.label}</Label><Meter.Output className="min-w-0 text-right text-xs tabular-nums [overflow-wrap:anywhere]">{feature.count.toLocaleString('zh-CN')}</Meter.Output></div>
            <Meter.Track><Meter.Fill /></Meter.Track>
          </Meter>)}
        </div>
      </AdminPanel> : null}
      {overview.data ? <AdminPanel title="班级账户数（前 10）">
        <AdminState empty={classes.length === 0} />
        <ol className="divide-y divide-separator">
          {classes.map((item, index) => <li key={item.className} className="flex items-center gap-3 py-2.5 first:pt-0">
            <span className="w-5 shrink-0 text-xs tabular-nums text-muted">{index + 1}</span>
            <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{item.className || '未分配'}</span>
            <span className="shrink-0 text-sm tabular-nums">{item.count.toLocaleString('zh-CN')}</span>
          </li>)}
        </ol>
      </AdminPanel> : null}
    </div>
  </AdminPage>;
}
