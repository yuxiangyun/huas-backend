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
  className?: string;
}

const itemSizeClasses = {
  sm: 'h-10 text-sm',
  md: 'h-11 text-[0.95rem]',
} as const;

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn('glass-panel flex items-center gap-1 rounded-[1.4rem] p-1', className)}>
      {items.map((item) => {
        const active = item.value === value;

        return (
          <button
            key={item.value}
            aria-pressed={active}
            className={cn(
              'flex-1 rounded-pill font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-45',
              itemSizeClasses[size],
              active
                ? 'bg-ink text-white shadow-card'
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
  );
}
