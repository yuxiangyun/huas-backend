/**
 * [INPUT]: 依赖早起运营概览、日周月榜单、展示设置、后台会话与共用 TanStack Charts
 * [OUTPUT]: 提供真实参与人数、累计打卡人次、日趋势、前 100 名榜单与资料入口设置
 * [POS]: pages/admin 的早起运营页；日榜按时间，周月榜按已有连续积分规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Table } from '@heroui/react/table';
import { Tabs } from '@heroui/react/tabs';
import { useMemo, useState } from 'react';
import { useAdminEarlyRisingLeaderboardQuery, useAdminEarlyRisingOverviewQuery, useAdminEarlyRisingSettingsQuery } from '@/entities/admin/api/admin-queries';
import type { AdminEarlyRisingPeriod, AdminTrendDays } from '@/entities/admin/model/admin-types';
import { EarlyRisingSettings } from '@/pages/admin/early-rising-settings';
import { formatBeijingDateTime, InsightMetric, TrendPeriod } from '@/pages/admin/insights-ui';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { AdminPage, AdminPanel, AdminState } from '@/shared/ui/admin';
import { TimeSeriesChart } from '@/shared/ui/charts/time-series-chart';

const PERIODS = [{ id: 'today', label: '今日' }, { id: 'week', label: '本周' }, { id: 'month', label: '本月' }] as const;

export function AdminEarlyRisingPage() {
  const { session } = useAdminOutletContext();
  const [days, setDays] = useState<AdminTrendDays>(30);
  const [period, setPeriod] = useState<AdminEarlyRisingPeriod>('today');
  const overview = useAdminEarlyRisingOverviewQuery(session, days);
  const leaderboard = useAdminEarlyRisingLeaderboardQuery(session, period);
  const settings = useAdminEarlyRisingSettingsQuery(session);
  const data = overview.data;
  const dailySeries = useMemo(() => [{ id: 'checkins', label: '打卡人数', values: (data?.series ?? []).map((point) => ({ date: point.date, value: point.count })) }], [data]);

  return <AdminPage title="早起">
    <AdminState loading={overview.isLoading} error={overview.error} onRetry={() => { void overview.refetch(); }} />
    {data ? <>
      <div className="grid gap-7 border-b border-separator pb-7 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-1"><InsightMetric label="今日打卡" value={data.todayParticipants} /><InsightMetric label="累计参与" value={data.totalParticipants} /><InsightMetric label="累计打卡" value={data.totalCheckins} /></dl>
      <AdminPanel title="每日打卡人数" actions={<TrendPeriod value={days} onChange={setDays} />}><TimeSeriesChart series={dailySeries} ariaLabel="每日打卡人数趋势" /></AdminPanel>
      </div>
    </> : null}
    <AdminPanel>
      <Tabs selectedKey={period} onSelectionChange={(value) => { if (value === 'today' || value === 'week' || value === 'month') setPeriod(value); }}>
        <Tabs.ListContainer className="w-fit"><Tabs.List aria-label="榜单周期">{PERIODS.map((item) => <Tabs.Tab key={item.id} id={item.id}>{item.label}<Tabs.Indicator /></Tabs.Tab>)}</Tabs.List></Tabs.ListContainer>
        {PERIODS.map((item) => <Tabs.Panel key={item.id} id={item.id}>
          {period === item.id ? <>
            <AdminState loading={leaderboard.isLoading} error={leaderboard.error} onRetry={() => { void leaderboard.refetch(); }} />
            {leaderboard.data ? <Table variant="secondary"><Table.ScrollContainer><Table.Content aria-label={`${item.label}早起榜单`} className="min-w-[40rem] table-fixed">
              <Table.Header>
                <Table.Column id="rank" className="w-20" isRowHeader>排名</Table.Column><Table.Column id="displayName" className="w-48">用户</Table.Column><Table.Column id="currentStreak" className="w-28">连续天数</Table.Column>
                {period === 'today' ? <Table.Column id="checkedAt">打卡时间</Table.Column> : [<Table.Column key="score" id="continuityScore">连续积分</Table.Column>, <Table.Column key="days" id="validDays">有效天数</Table.Column>]}
              </Table.Header>
              <Table.Body items={leaderboard.data.items} renderEmptyState={() => <AdminState empty emptyText="暂无打卡" />}>
                {(row) => <Table.Row id={row.profile.id}>
                  <Table.Cell className="tabular-nums">{row.rank}</Table.Cell><Table.Cell className="[overflow-wrap:anywhere]">{row.profile.displayName}</Table.Cell><Table.Cell className="tabular-nums">{row.currentStreak}</Table.Cell>
                  {period === 'today' ? <Table.Cell className="tabular-nums">{formatBeijingDateTime(row.checkedAt, true)}</Table.Cell> : [<Table.Cell key="score" className="tabular-nums">{row.continuityScore ?? '—'}</Table.Cell>, <Table.Cell key="days" className="tabular-nums">{row.validDays ?? '—'}</Table.Cell>]}
                </Table.Row>}
              </Table.Body>
            </Table.Content></Table.ScrollContainer></Table> : null}
          </> : null}
        </Tabs.Panel>)}
      </Tabs>
    </AdminPanel>
    <div className="border-t border-separator pt-6"><EarlyRisingSettings session={session} settingsQuery={settings} /></div>
  </AdminPage>;
}
