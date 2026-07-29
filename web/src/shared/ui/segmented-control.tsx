/**
 * [INPUT]: 依赖 React 节点类型与 shared/lib/cn 的样式合并能力
 * [OUTPUT]: 对外提供 SegmentedControl 与选项类型，统一单选分段交互
 * [POS]: shared/ui 的受控选择原语，由调用方管理当前值与变更结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface SegmentedControlItem<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  items: readonly SegmentedControlItem<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  layout?: 'fill' | 'fit';
  trailing?: ReactNode;
  className?: string;
}

const itemSizeClasses = {
  sm: 'h-9 text-sm',
  md: 'h-10 text-[0.95rem]',
} as const;

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  size = 'md',
  layout = 'fill',
  trailing,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 border border-line bg-tint-soft p-1',
        layout === 'fill'
          ? 'w-full rounded-[0.75rem]'
          : 'inline-flex max-w-full rounded-[0.75rem]',
        className
      )}
    >
      <div className={cn('flex min-w-0 items-center gap-1', layout === 'fill' ? 'flex-1' : 'max-w-full')}>
        {items.map((item) => {
          const active = item.value === value;

          return (
            <button
              key={item.value}
              aria-pressed={active}
              className={cn(
                'rounded-[0.5rem] font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/35 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none',
                itemSizeClasses[size],
                layout === 'fill' ? 'flex-1 px-3' : 'shrink-0 px-4',
                active
                  ? 'bg-white text-ink shadow-card'
                  : 'text-muted hover:text-ink'
              )}
              disabled={item.disabled}
              type="button"
              onClick={() => onChange(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
