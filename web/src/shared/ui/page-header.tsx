import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  compact = false,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('page-header-mobile px-1', className)}>
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className={cn('min-w-0', compact ? 'space-y-1.5' : 'space-y-2')}>
          {eyebrow ? (
            <p
              className="text-[0.74rem] font-medium uppercase text-muted"
              style={{ letterSpacing: 'var(--tracking-eyebrow)' }}
            >
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={cn(
              'max-w-[13ch] font-semibold leading-[0.94] tracking-[-0.05em] text-ink sm:max-w-none sm:text-4xl',
              compact ? 'text-[var(--font-title-section)]' : 'text-[var(--font-title-page)]'
            )}
          >
            {title}
          </h1>
          {description ? (
            <p className="max-w-[28rem] text-[0.95rem] leading-7 text-muted sm:text-sm">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 pt-1">{action}</div> : null}
      </div>
    </header>
  );
}
