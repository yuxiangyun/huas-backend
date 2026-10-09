import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface AdminPageProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AdminPage({ title, actions, children, className }: AdminPageProps) {
  return (
    <div className={cn('mx-auto min-w-0 max-w-6xl space-y-7', className)}>
      <header className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.625rem] font-semibold tracking-tight">{title}</h1>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

interface AdminPanelProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AdminPanel({ title, actions, children, className }: AdminPanelProps) {
  return (
    <section className={cn('min-w-0 space-y-4', className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="min-w-0 flex-1 text-sm font-semibold [overflow-wrap:anywhere]">{title}</h2> : <span />}
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
