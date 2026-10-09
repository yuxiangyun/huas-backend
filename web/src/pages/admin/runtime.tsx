/**
 * [INPUT]: 依赖当前进程运行采样、只读计数器与后台会话
 * [OUTPUT]: 提供数据库、进程、内存、运行时长和累计指标的手动/自动刷新
 * [POS]: pages/admin 的运行观测页；仅展示已有进程事实，不派生上游健康或时延分位数
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Button } from '@heroui/react/button';
import { Table } from '@heroui/react/table';
import { useMemo, useState } from 'react';
import { useAdminRuntimeQuery } from '@/entities/admin/api/admin-queries';
import { InsightMetric } from '@/pages/admin/insights-ui';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { AdminPage, AdminPanel, AdminState } from '@/shared/ui/admin';

const METRICS: Record<string, { label: string; unit: string }> = {
  huas_http_requests_total: { label: 'HTTP 请求', unit: '次' },
  huas_http_request_duration_ms_count: { label: 'HTTP 耗时样本', unit: '次' },
  huas_http_request_duration_ms_sum: { label: 'HTTP 累计耗时', unit: 'ms' },
  huas_upstream_requests_total: { label: '上游请求', unit: '次' },
  huas_fallback_total: { label: '数据回退', unit: '次' },
  huas_cache_access_total: { label: '缓存访问', unit: '次' },
  huas_singleflight_merge_total: { label: '合并等待', unit: '次' },
  huas_sqlite_busy_total: { label: 'SQLite 忙碌', unit: '次' },
  huas_analytics_flush_failure_total: { label: '统计写入失败', unit: '次' },
};
const LABELS: Record<string, string> = { success: '成功', failure: '失败', timeout: '超时', hit: '命中', miss: '未命中' };

function formatUptime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  return days ? `${days} 天 ${hours} 小时` : hours ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

export function AdminRuntimePage() {
  const { session } = useAdminOutletContext();
  const [automatic, setAutomatic] = useState(true);
  const query = useAdminRuntimeQuery(session, { refetchInterval: automatic ? 10_000 : false });
  const snapshot = query.data;
  const rows = useMemo(() => snapshot?.metrics.map((metric) => ({
    ...metric,
    id: `${metric.name}:${JSON.stringify(Object.entries(metric.labels).sort(([left], [right]) => left.localeCompare(right)))}`,
  })) ?? [], [snapshot]);

  return <AdminPage title="运行" actions={<>
    <Button size="sm" variant="ghost" onPress={() => setAutomatic((value) => !value)}>{automatic ? '暂停刷新' : '自动刷新'}</Button>
    <Button size="sm" variant="secondary" isDisabled={query.isFetching} onPress={() => { void query.refetch(); }}>刷新</Button>
  </>}>
    <AdminState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch(); }} />
    {snapshot ? <>
      <dl className="grid grid-cols-2 gap-6 border-b border-separator pb-6 lg:grid-cols-4">
        <InsightMetric label="数据库" value={snapshot.databaseStatus === 'ok' ? '正常' : '异常'} />
        <InsightMetric label="进程" value={snapshot.process.shuttingDown ? '关闭中' : snapshot.process.ready ? '就绪' : '未就绪'} />
        <InsightMetric label="运行时长" value={formatUptime(snapshot.uptimeSeconds)} />
        <InsightMetric label="部署槽位" value={snapshot.process.deploySlot || '—'} />
      </dl>
      <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <InsightMetric label="RSS（MB）" value={snapshot.memory.rssMb} /><InsightMetric label="Heap 已用（MB）" value={snapshot.memory.heapUsedMb} /><InsightMetric label="Heap 总量（MB）" value={snapshot.memory.heapTotalMb} />
      </dl>
      <AdminPanel title="进程累计指标">
        <Table variant="secondary"><Table.ScrollContainer><Table.Content aria-label="当前进程累计指标" className="min-w-[40rem] table-fixed">
          <Table.Header><Table.Column id="name" className="w-48" isRowHeader>指标</Table.Column><Table.Column id="labels">维度</Table.Column><Table.Column id="value" className="w-36">数值</Table.Column><Table.Column id="unit" className="w-20">单位</Table.Column></Table.Header>
          <Table.Body items={rows} renderEmptyState={() => <AdminState empty />}>
            {(metric) => <Table.Row id={metric.id}>
              <Table.Cell className="[overflow-wrap:anywhere]">{METRICS[metric.name]?.label ?? metric.name}</Table.Cell><Table.Cell className="text-muted"><div className="flex flex-wrap gap-x-3 gap-y-1 [overflow-wrap:anywhere]">{Object.values(metric.labels).length ? Object.entries(metric.labels).map(([key, value]) => <span key={key}>{LABELS[value] ?? value}</span>) : '—'}</div></Table.Cell><Table.Cell className="tabular-nums [overflow-wrap:anywhere]">{metric.value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</Table.Cell><Table.Cell className="text-muted">{METRICS[metric.name]?.unit ?? '—'}</Table.Cell>
            </Table.Row>}
          </Table.Body>
        </Table.Content></Table.ScrollContainer></Table>
      </AdminPanel>
    </> : null}
  </AdminPage>;
}
