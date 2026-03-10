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
        'glass-panel flex items-center gap-1 p-1',
        layout === 'fill'
          ? 'w-full rounded-[1.4rem]'
          : 'inline-flex max-w-full rounded-[1.25rem]',
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
                'rounded-pill font-medium whitespace-nowrap transition duration-150 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none',
                itemSizeClasses[size],
                layout === 'fill' ? 'flex-1 px-3' : 'shrink-0 px-4',
                active
                  ? 'bg-ink text-white shadow-card max-sm:shadow-none'
                  : 'text-muted hover:bg-white/65 hover:text-ink active:bg-white'
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
