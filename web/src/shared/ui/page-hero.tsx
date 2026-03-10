import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface PageHeroProps {
  eyebrow?: string;
  prefix?: string;
  highlight: string;
  suffix?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHero({
  eyebrow,
  prefix,
  highlight,
  suffix,
  description,
  action,
  className,
}: PageHeroProps) {
  return (
    <header className={cn('px-1', className)}>
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.24em] text-muted">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="max-w-[13ch] text-[1.9rem] font-semibold tracking-[-0.06em] text-ink sm:max-w-none sm:text-[2.15rem]">
            {prefix ? <span>{prefix}</span> : null}
            <span className={prefix ? 'ml-1' : undefined}>
              <span className="relative inline-block pr-[0.06em]">
                <span className="absolute inset-x-0 bottom-[0.12em] h-[0.38em] rounded-full bg-[#efc8e9]" />
                <span className="relative z-10">{highlight}</span>
              </span>
            </span>
            {suffix ? <span className="ml-1">{suffix}</span> : null}
          </h1>
          {description ? (
            <p className="max-w-[32rem] text-sm leading-6 text-muted sm:text-[0.95rem] sm:leading-7">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 pt-1">{action}</div> : null}
      </div>
    </header>
  );
}
