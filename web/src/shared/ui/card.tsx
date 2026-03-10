import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-white/60 bg-card p-5 shadow-card backdrop-blur-2xl',
        className
      )}
      {...props}
    />
  );
}
