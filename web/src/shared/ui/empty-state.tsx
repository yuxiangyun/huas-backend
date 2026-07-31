/**
 * [INPUT]: 依赖 ReactNode 与可选动作
 * [OUTPUT]: 对外提供 EmptyState，以克制文案呈现无数据或首次使用状态
 * [POS]: shared/ui 的通用空状态原语，不推断原因、不生成营销式说明
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="mt-1.5 max-w-xs text-sm leading-6 text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
