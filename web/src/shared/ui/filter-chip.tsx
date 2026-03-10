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
        'inline-flex shrink-0 items-center justify-center rounded-pill font-medium leading-none whitespace-nowrap transition duration-150 active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none',
        sizeClasses[size],
        selected
          ? 'bg-ink text-white shadow-card max-sm:shadow-none'
          : 'bg-white/78 text-muted ring-1 ring-line hover:bg-white hover:text-ink active:bg-[#f4f5f6] max-sm:bg-white/92',
        className
      )}
      type={type}
      {...props}
    />
  );
}
