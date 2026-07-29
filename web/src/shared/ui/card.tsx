/**
 * [INPUT]: 依赖 React 原生容器属性与 shared/lib/cn 的样式合并能力
 * [OUTPUT]: 对外提供 Card 组件，统一内容容器的边界、背景与间距
 * [POS]: shared/ui 的中性容器原语，不承载业务状态或交互语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-card p-[var(--space-card-padding)] shadow-card',
        className
      )}
      {...props}
    />
  );
}
