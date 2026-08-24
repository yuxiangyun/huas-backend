/**
 * [INPUT]: 依赖 ReactNode 组合能力与 shared/lib/cn 样式合并能力
 * [OUTPUT]: 对外提供 PageHeader，统一可组合页面标题、描述、操作区与可选标题样式的响应式排布、最小高度及底部分割线基线
 * [POS]: shared/ui 的页级标题原语，统一页头高度、底部边界、标题与操作的垂直中线并在窄屏保留换行能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  visual?: ReactNode;
  compact?: boolean;
  className?: string;
  titleClassName?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  visual,
  compact = false,
  className,
  titleClassName,
}: PageHeaderProps) {
  const content = (
    <div className={cn('min-w-[7rem] flex-1', compact ? 'space-y-1' : 'space-y-1.5')}>
      {eyebrow ? (
        <p
          className="text-xs font-medium text-muted"
          style={{ letterSpacing: 'var(--tracking-eyebrow)' }}
        >
          {eyebrow}
        </p>
      ) : null}
      <h1
        className={cn(
          'font-semibold leading-tight tracking-[-0.025em] text-ink',
          compact ? 'text-[var(--font-title-section)]' : 'text-[var(--font-title-page)]',
          titleClassName
        )}
      >
        {title}
      </h1>
      {description ? (
        <p className="max-w-[34rem] text-sm leading-5 text-muted">
          {description}
        </p>
      ) : null}
    </div>
  );

  return (
    <header className={cn('page-header-mobile', className)}>
      {visual ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 sm:gap-4">
            {content}
            {action ? <div className="ml-auto flex shrink-0 items-center">{action}</div> : null}
          </div>
          <div className="w-full self-stretch sm:w-auto sm:self-auto">
            {visual}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          {content}
          {action ? <div className="ml-auto flex shrink-0 items-center">{action}</div> : null}
        </div>
      )}
    </header>
  );
}
