import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  visual?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  visual,
  compact = false,
  className,
}: PageHeaderProps) {
  const content = (
    <div className={cn('min-w-0', compact ? 'space-y-1.5' : 'space-y-2')}>
      {eyebrow ? (
        <p
          className="text-[0.8rem] font-medium text-muted"
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
        <p className="max-w-[28rem] text-sm leading-6 text-muted sm:text-[0.95rem] sm:leading-7">
          {description}
        </p>
      ) : null}
    </div>
  );

  return (
    <header className={cn('page-header-mobile px-1', className)}>
      {visual ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start justify-between gap-3 sm:gap-4">
            {content}
            {action ? <div className="shrink-0 pt-1">{action}</div> : null}
          </div>
          <div className="w-full self-stretch sm:w-auto sm:self-auto sm:pt-1">
            {visual}
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          {content}
          {action ? <div className="shrink-0 pt-1">{action}</div> : null}
        </div>
      )}
    </header>
  );
}
