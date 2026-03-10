import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-card p-[var(--space-card-padding)] shadow-card backdrop-blur-[28px] max-sm:border-black/5 max-sm:bg-white/92 max-sm:shadow-[0_8px_20px_rgba(15,23,42,0.08)] max-sm:backdrop-blur-none',
        className
      )}
      {...props}
    />
  );
}
