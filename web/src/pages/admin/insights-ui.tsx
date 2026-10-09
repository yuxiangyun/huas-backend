import { ToggleButton } from '@heroui/react/toggle-button';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import type { AdminTrendDays } from '@/entities/admin/model/admin-types';

export function InsightMetric({ label, value }: { label: string; value: number | string }) {
  return <div className="min-w-0 py-1"><dt className="text-xs text-muted">{label}</dt><dd className={typeof value === 'number' ? 'mt-1.5 text-[1.75rem] font-semibold leading-tight tracking-tight tabular-nums [overflow-wrap:anywhere]' : 'mt-1.5 text-xl font-semibold leading-tight tracking-tight tabular-nums [overflow-wrap:anywhere]'}>{typeof value === 'number' ? value.toLocaleString('zh-CN') : value}</dd></div>;
}

export function TrendPeriod({ value, onChange }: { value: AdminTrendDays; onChange: (value: AdminTrendDays) => void }) {
  return (
    <ToggleButtonGroup aria-label="时间范围" size="sm" selectionMode="single" disallowEmptySelection selectedKeys={[String(value)]} onSelectionChange={(keys) => {
      const next = Number([...keys][0]);
      if (next === 7 || next === 30 || next === 90) onChange(next);
    }}>
      {([7, 30, 90] as const).map((days) => <ToggleButton key={days} id={String(days)}>{days} 天</ToggleButton>)}
    </ToggleButtonGroup>
  );
}

export function formatBeijingDateTime(value: string | null | undefined, timeOnly = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false,
    ...(timeOnly ? {} : { year: 'numeric', month: '2-digit', day: '2-digit' } as const),
    hour: '2-digit', minute: '2-digit', ...(timeOnly ? { second: '2-digit' } as const : {}),
  });
}
