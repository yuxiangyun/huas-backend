import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  size?: 'sm' | 'md';
}

const sizeClasses = {
  sm: 'h-[var(--control-height-xs)] px-3 text-[0.8rem]',
  md: 'h-[var(--control-height-sm)] px-4 text-sm',
} as const;

export function FilterChip({
  className,
  selected = false,
  size = 'md',
  type = 'button',
  ...props
}: FilterChipProps) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-pill font-medium leading-none whitespace-nowrap transition duration-150 active:scale-[0.985]',
        sizeClasses[size],
        selected
          ? 'bg-tint text-white shadow-card'
          : 'bg-white/75 text-muted ring-1 ring-line hover:bg-white hover:text-ink active:bg-white/95',
        className
      )}
      type={type}
      {...props}
    />
  );
}
